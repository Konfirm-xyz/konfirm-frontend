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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setState only runs after the await inside load(), not synchronously in the effect
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
    if (
      !window.confirm(
        `Propose a settlement of ${amount} USDC to ${merchantAddress} as signer ${actingAs}?\n\nThis only creates a pending proposal. No funds move until enough signers approve and it is executed.`,
      )
    )
      return;
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
    if (
      !window.confirm(
        `Approve settlement #${row.onchain_settlement_id} (${formatUsdc(row.amount)} USDC to ${row.merchant_address}) as signer ${actingAs}?`,
      )
    )
      return;
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
    if (
      !window.confirm(
        `Execute settlement #${row.onchain_settlement_id}? This sends ${formatUsdc(row.amount)} USDC from the treasury to ${row.merchant_address} on-chain and cannot be reversed.`,
      )
    )
      return;
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
        Couldn't load treasury status. Check the backend is running and try again.
      </div>
    );

  return (
    <div>
      <h1>Treasury</h1>

      <div className="admin-card">
        <h2 id="treasury-contract-heading">Contract</h2>
        <table className="admin-table" aria-labelledby="treasury-contract-heading">
          <thead>
            <tr>
              <th>Address</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <a
                  href={explorerUrl(status.contract_id, "contract", status.network)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {status.contract_id}
                </a>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="admin-card">
        <h2 id="treasury-signers-heading">Signers ({status.threshold})</h2>
        <table className="admin-table" aria-labelledby="treasury-signers-heading">
          <thead>
            <tr>
              <th>Address</th>
            </tr>
          </thead>
          <tbody>
            {status.signers.map((signer) => (
              <tr key={signer}>
                <td>
                  <a href={explorerUrl(signer, "account", status.network)} target="_blank" rel="noreferrer">
                    {signer}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="admin-card">
        <h2>Status</h2>
        <p>
          USDC balance: {status.usdc_balance ?? "—"} · Reachable: {status.reachable ? "yes" : "no"} · Wired into
          checkout: {status.wired_into_checkout ? "yes" : "no"}
        </p>
      </div>

      <div className="admin-card">
        <h2>Propose settlement</h2>
        <form onSubmit={handlePropose}>
          <label>
            Acting as
            <input
              value={actingAs}
              onChange={(e) => setActingAs(e.target.value)}
              placeholder="G…"
              required
            />
          </label>
          <label>
            Merchant address
            <input
              value={merchantAddress}
              onChange={(e) => setMerchantAddress(e.target.value)}
              placeholder="G…"
              required
            />
          </label>
          <label>
            Amount (USDC)
            <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" required />
          </label>
          <button type="submit" disabled={proposing}>
            {proposing ? "Proposing…" : "Propose"}
          </button>
        </form>
        {message && <p className={message.error ? "error" : ""}>{message.text}</p>}
      </div>

      <div className="admin-card">
        <h2 id="treasury-settlements-heading">Settlements</h2>
        {loadingSettlements ? (
          <div className="empty">Loading…</div>
        ) : settlements.length === 0 ? (
          <div className="empty">No settlements yet.</div>
        ) : (
          <table className="admin-table" aria-labelledby="treasury-settlements-heading">
            <thead>
              <tr>
                <th>ID</th>
                <th>Merchant</th>
                <th>Amount</th>
                <th>Approvals</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {settlements.map((row) => (
                <tr key={row.onchain_settlement_id}>
                  <td>{row.onchain_settlement_id}</td>
                  <td title={row.merchant_address}>{shortAddress(row.merchant_address)}</td>
                  <td>{formatUsdc(row.amount)}</td>
                  <td>{row.approvals_count}</td>
                  <td>{row.status}</td>
                  <td>{formatDate(row.created_at)}</td>
                  <td>
                    <button
                      type="button"
                      onClick={() => handleApprove(row)}
                      disabled={busyAction !== null}
                    >
                      {busyAction === `${row.onchain_settlement_id}-approve` ? "Approving…" : "Approve"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExecute(row)}
                      disabled={busyAction !== null}
                    >
                      {busyAction === `${row.onchain_settlement_id}-execute` ? "Executing…" : "Execute"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
