"use client";

import { useEffect, useState, type FormEvent } from "react";
import freighterApi from "@stellar/freighter-api";
import { apiFetch, apiPost, type ApiResult } from "@/lib/api";
import { explorerUrl } from "@/lib/stellar-explorer";

interface TreasuryStatus {
  contract_id: string;
  signers: string[];
  threshold: string;
  usdc_balance: string | null;
  reachable: boolean;
  wired_into_checkout: boolean;
  // Optional: not yet returned by the backend. Once
  // admin-treasury.service.ts includes it in the response, this page will
  // automatically link to the correct network's explorer instead of
  // falling back to testnet.
  network?: string;
}

// Matches AdminTreasurySettlementsService.SettlementRow (konfirm-backend
// src/admin/admin-treasury-settlements.service.ts) exactly.
interface SettlementRow {
  onchain_settlement_id: string;
  merchant_address: string;
  amount: string;
  approvals_count: number;
  status: string;
  created_at: string;
  updated_at: string;
}

// {build_token, unsigned_xdr, network_passphrase, tx_hash} -- the shape
// every one of propose/approve/execute returns (admin-treasury-settlements
// .controller.ts).
interface BuiltTx {
  build_token: string;
  unsigned_xdr: string;
  network_passphrase: string;
  tx_hash: string;
}

function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 4)}…${address.slice(-4)}` : address;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

// treasury_settlements.amount mirrors the contract's raw i128 unit exactly
// (no decimal conversion happens server-side) -- the treasury was
// initialized with a single USDC SAC, 7 decimal places, same convention
// classic Stellar stroops use.
function formatUsdc(rawAmount: string): string {
  try {
    const stroops = BigInt(rawAmount);
    const whole = stroops / 10_000_000n;
    const frac = (stroops % 10_000_000n).toString().padStart(7, "0");
    return `${whole}.${frac}`;
  } catch {
    return rawAmount;
  }
}

function describeFailure(result: ApiResult<unknown>): string {
  if (result.ok) return "";
  return result.message || "Something went wrong. Please try again.";
}

export default function AdminTreasuryPage() {
  const [status, setStatus] = useState<TreasuryStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);

  const [settlements, setSettlements] = useState<SettlementRow[]>([]);
  const [loadingSettlements, setLoadingSettlements] = useState(true);

  // Whichever treasury signer (deployer/signer2/signer3) the admin has
  // connected in Freighter right now. There's no session-bound signer
  // identity the way a merchant session has `stellar_base_address` -- an
  // admin operates as whichever of the three real signers they chose to
  // unlock in their own wallet, so this page asks for it directly.
  const [actingAs, setActingAs] = useState("");

  const [merchantAddress, setMerchantAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [proposing, setProposing] = useState(false);

  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  async function load() {
    setLoadingStatus(true);
    const result = await apiFetch<TreasuryStatus>("/admin/treasury/status");
    if (result.ok) setStatus(result.data);
    setLoadingStatus(false);
  }

  async function loadSettlements() {
    setLoadingSettlements(true);
    const result = await apiFetch<SettlementRow[]>("/admin/treasury/settlements");
    if (result.ok) setSettlements(result.data ?? []);
    setLoadingSettlements(false);
  }

  useEffect(() => {
    load();
    loadSettlements();
  }, []);

  // Shared by propose/approve/execute: ask the connected wallet to sign
  // the unsigned XDR a build endpoint returned, then submit it. Never
  // signs with any key Konfirm holds -- Freighter is the only signer,
  // same split-custody model fee-settlement.tsx already uses for a
  // merchant's own key.
  async function signAndSubmit(built: BuiltTx): Promise<ApiResult<SettlementRow & { tx_hash: string }>> {
    const signed = await freighterApi.signTransaction(built.unsigned_xdr, {
      networkPassphrase: built.network_passphrase,
      address: actingAs,
    });
    if (signed.error || !signed.signedTxXdr) {
      return { ok: false, status: 0, message: "The wallet didn't sign this transaction.", body: signed.error ?? null };
    }
    return apiPost<SettlementRow & { tx_hash: string }>("/admin/treasury/settlements/submit", {
      signed_xdr: signed.signedTxXdr,
      build_token: built.build_token,
    });
  }

  async function handlePropose(e: FormEvent) {
    e.preventDefault();
    if (!actingAs) {
      setMessage({ text: "Select which signer you're acting as first.", error: true });
      return;
    }
    setProposing(true);
    setMessage(null);
    try {
      const built = await apiPost<BuiltTx>("/admin/treasury/settlements/propose", {
        proposer_address: actingAs,
        merchant_address: merchantAddress,
        amount,
      });
      if (!built.ok) {
        setMessage({ text: describeFailure(built), error: true });
        return;
      }
      setMessage({ text: "Approve the proposal in your wallet…", error: false });
      const result = await signAndSubmit(built.data as BuiltTx);
      if (!result.ok) {
        setMessage({ text: describeFailure(result), error: true });
        return;
      }
      setMessage({ text: `Settlement #${result.data?.onchain_settlement_id} proposed.`, error: false });
      setMerchantAddress("");
      setAmount("");
      await loadSettlements();
    } finally {
      setProposing(false);
    }
  }

  async function handleApprove(row: SettlementRow) {
    if (!actingAs) {
      setMessage({ text: "Select which signer you're acting as first.", error: true });
      return;
    }
    setBusyAction(`${row.onchain_settlement_id}-approve`);
    setMessage(null);
    try {
      const built = await apiPost<BuiltTx>(`/admin/treasury/settlements/${row.onchain_settlement_id}/approve`, {
        signer_address: actingAs,
      });
      if (!built.ok) {
        setMessage({ text: describeFailure(built), error: true });
        return;
      }
      setMessage({ text: "Approve in your wallet…", error: false });
      const result = await signAndSubmit(built.data as BuiltTx);
      if (!result.ok) {
        setMessage({ text: describeFailure(result), error: true });
        return;
      }
      setMessage({ text: `Settlement #${row.onchain_settlement_id} approved.`, error: false });
      await loadSettlements();
    } finally {
      setBusyAction(null);
    }
  }

  async function handleExecute(row: SettlementRow) {
    if (!actingAs) {
      setMessage({ text: "Select which signer you're acting as first.", error: true });
      return;
    }
    setBusyAction(`${row.onchain_settlement_id}-execute`);
    setMessage(null);
    try {
      const built = await apiPost<BuiltTx>(`/admin/treasury/settlements/${row.onchain_settlement_id}/execute`, {
        caller_address: actingAs,
      });
      if (!built.ok) {
        setMessage({ text: describeFailure(built), error: true });
        return;
      }
      setMessage({ text: "Approve in your wallet…", error: false });
      const result = await signAndSubmit(built.data as BuiltTx);
      if (!result.ok) {
        setMessage({ text: describeFailure(result), error: true });
        return;
      }
      setMessage({ text: `Settlement #${row.onchain_settlement_id} executed.`, error: false });
      await loadSettlements();
    } finally {
      setBusyAction(null);
    }
  }

  if (loadingStatus) return <div className="empty">Loading…</div>;
  if (!status)
    return (
      <div className="empty">
        Could not load treasury status.{" "}
        <button type="button" onClick={load}>
          Try again
        </button>
      </div>
    );

  return (
    <div>
      <h1>Treasury</h1>
      <p className="sub">
        The treasury Soroban contract, read live via its USDC balance. It is deployed and multi-sig-controlled, and now
        receives checkout&apos;s USDC-denominated fee revenue via a periodic sweep — not a direct call at checkout time (a
        Soroban invocation must be the only operation in its transaction, so the fee leg is a plain classic payment into a
        separate collection account first).
      </p>

      {status.wired_into_checkout && (
        <div className="status" style={{ marginBottom: 20 }}>
          USDC only — XLM- and EURC-denominated fee revenue is not swept into this contract, since it was initialized with
          a single token and can&apos;t custody other assets.
        </div>
      )}

      <div className="admin-section">
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-label">USDC balance</div>
            <div className={`stat-value ${status.reachable ? "" : "stat-bad"}`}>
              {status.reachable ? `$${Number(status.usdc_balance).toFixed(2)}` : "unreachable"}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Signer threshold</div>
            <div className="stat-value">{status.threshold}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Signers</div>
            <div className="stat-value">{status.signers.length}</div>
          </div>
        </div>
      </div>

      <div className="admin-section">
        <h2>Contract</h2>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Address</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="mono">
                  <a href={explorerUrl(status.contract_id, status.network)} target="_blank" rel="noreferrer">
                    {status.contract_id}
                  </a>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="admin-section">
        <h2>Signers ({status.signers.length})</h2>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Address</th>
              </tr>
            </thead>
            <tbody>
              {status.signers.map((s) => (
                <tr key={s}>
                  <td className="mono" title={s}>{shortAddress(s)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="admin-section">
        <h2>Settlements</h2>
        <p className="sub">
          propose_settlement/approve_settlement/execute_settlement all require a real signer&apos;s own key
          (<code>require_signer</code>) — Konfirm never holds or relays it. Pick which signer you&apos;re connected as in
          Freighter below, then propose, approve, or execute: each builds an unsigned transaction here, asks Freighter to
          sign it, and submits what comes back.
        </p>

        <form className="admin-inline-form" style={{ marginBottom: 16 }} onSubmit={(e) => e.preventDefault()}>
          <div className="field">
            <label htmlFor="acting-as">Acting as (connected in Freighter)</label>
            {status.signers.length > 0 ? (
              <select id="acting-as" value={actingAs} onChange={(e) => setActingAs(e.target.value)}>
                <option value="">Select a signer…</option>
                {status.signers.map((s) => (
                  <option key={s} value={s}>
                    {shortAddress(s)} — {s}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id="acting-as"
                type="text"
                placeholder="G..."
                autoComplete="off"
                value={actingAs}
                onChange={(e) => setActingAs(e.target.value)}
              />
            )}
          </div>
        </form>

        <form className="admin-inline-form" style={{ marginBottom: 16 }} onSubmit={handlePropose}>
          <div className="field">
            <label htmlFor="merchant-address">Merchant address</label>
            <input
              id="merchant-address"
              type="text"
              placeholder="G..."
              autoComplete="off"
              value={merchantAddress}
              onChange={(e) => setMerchantAddress(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="amount">Amount (USDC)</label>
            <input
              id="amount"
              type="text"
              placeholder="0.0000000"
              autoComplete="off"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <button type="submit" className="primary" disabled={proposing}>
            Propose settlement
          </button>
        </form>

        {message && <div className={`status${message.error ? " error" : ""}`}>{message.text}</div>}

        {loadingSettlements ? (
          <div className="empty">Loading…</div>
        ) : settlements.length === 0 ? (
          <div className="empty">No settlements tracked yet. Propose one above.</div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Merchant</th>
                  <th>Amount</th>
                  <th>Approvals</th>
                  <th>Status</th>
                  <th>Updated</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {settlements.map((row) => {
                  const approveBusy = busyAction === `${row.onchain_settlement_id}-approve`;
                  const executeBusy = busyAction === `${row.onchain_settlement_id}-execute`;
                  const anyBusy = busyAction !== null;
                  return (
                    <tr key={row.onchain_settlement_id}>
                      <td>#{row.onchain_settlement_id}</td>
                      <td className="mono">{shortAddress(row.merchant_address)}</td>
                      <td>${formatUsdc(row.amount)}</td>
                      <td>
                        {row.approvals_count} / {status.threshold}
                      </td>
                      <td>{row.status}</td>
                      <td>{formatDate(row.updated_at)}</td>
                      <td>
                        {row.status === "Pending" && (
                          <div style={{ display: "flex", gap: 8 }}>
                            <button type="button" disabled={anyBusy} onClick={() => handleApprove(row)}>
                              {approveBusy ? "Approving…" : "Approve"}
                            </button>
                            <button type="button" disabled={anyBusy} onClick={() => handleExecute(row)}>
                              {executeBusy ? "Executing…" : "Execute"}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
