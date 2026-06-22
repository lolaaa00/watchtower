import type { WatchtowerClient } from "./client";
import { getContractAddress } from "./client";
import type {
  SourceRecord,
  WatchProfile,
  ScanRecord,
  AlertRecord,
  KeeperStatsRecord,
  ContractSummary,
} from "../types";

async function read(client: WatchtowerClient, functionName: string, args: any[] = []): Promise<any> {
  const contractAddr = getContractAddress();
  console.debug(`[read] ${functionName}(${JSON.stringify(args)}) on ${contractAddr}`);
  try {
    return await client.readContract({
      address: contractAddr,
      functionName,
      args,
    });
  } catch (e: any) {
    console.error(`[read] ${functionName} failed | contract=${contractAddr} | args=${JSON.stringify(args)} | error=${e?.message?.slice(0, 150)}`);
    throw e;
  }
}

// ── WORKING METHODS (no u64 first-arg issue) ──

export async function getContractSummary(client: WatchtowerClient): Promise<ContractSummary> {
  try {
    return (await read(client, "get_contract_summary")) as ContractSummary;
  } catch {
    return { total_sources: 0, total_profiles: 0, total_scans: 0, total_alerts: 0, total_actions: 0, total_reviews: 0, owner: "" };
  }
}

export async function getProfile(client: WatchtowerClient, profileId: string): Promise<WatchProfile> {
  return (await read(client, "get_profile", [profileId])) as WatchProfile;
}

export async function getAlert(client: WatchtowerClient, alertId: string): Promise<AlertRecord> {
  return (await read(client, "get_alert", [alertId])) as AlertRecord;
}

export async function getScan(client: WatchtowerClient, scanId: string): Promise<ScanRecord> {
  return (await read(client, "get_scan", [scanId])) as ScanRecord;
}

export async function getSource(client: WatchtowerClient, sourceId: string): Promise<SourceRecord> {
  return (await read(client, "get_source", [sourceId])) as SourceRecord;
}

export async function getKeeperStats(client: WatchtowerClient, keeper: string): Promise<KeeperStatsRecord> {
  try {
    return (await read(client, "get_keeper_stats", [keeper])) as KeeperStatsRecord;
  } catch {
    return { keeper, scans_triggered: 0, alerts_found: 0, duplicate_scans: 0, failed_scans: 0, last_active_at: 0, reputation_points: 0, reputation_band: "OBSERVER" };
  }
}

// get_alerts_for_profile works because first arg is str
export async function getAlertsForProfile(client: WatchtowerClient, profileId: string, offset = 0, limit = 50): Promise<AlertRecord[]> {
  try {
    return (await read(client, "get_alerts_for_profile", [profileId, offset, limit])) as AlertRecord[];
  } catch {
    return [];
  }
}

// get_profile_alert_ids works because first arg is str
export async function getProfileAlertIds(client: WatchtowerClient, profileId: string, offset = 0, limit = 50): Promise<string[]> {
  try {
    return (await read(client, "get_profile_alert_ids", [profileId, offset, limit])) as string[];
  } catch {
    return [];
  }
}

// ── WORKAROUND METHODS (avoid broken u64/address-first-arg calls) ──

// get_sources(u32, u32) fails — reconstruct from individual get_source calls
export async function getSources(client: WatchtowerClient, _offset = 0, _limit = 50): Promise<SourceRecord[]> {
  try {
    const summary = await getContractSummary(client);
    const total = summary.total_sources;
    if (total === 0) return [];
    const results: SourceRecord[] = [];
    for (let i = 1; i <= total; i++) {
      const sid = `SRC-${String(i).padStart(6, "0")}`;
      try {
        const s = await getSource(client, sid);
        if (s && s.source_id) results.push(s);
      } catch { /* source may not exist at this ID */ }
    }
    return results;
  } catch {
    return [];
  }
}

// get_profiles_by_owner(address, u32, u32) fails — reconstruct from get_profile
export async function getProfilesByOwner(client: WatchtowerClient, owner: string, _offset = 0, _limit = 20): Promise<WatchProfile[]> {
  if (!owner) return [];
  try {
    const summary = await getContractSummary(client);
    const total = summary.total_profiles;
    if (total === 0) return [];
    const results: WatchProfile[] = [];
    for (let i = 1; i <= total; i++) {
      const pid = `PRF-${String(i).padStart(6, "0")}`;
      try {
        const p = await getProfile(client, pid);
        if (p && p.owner && p.owner.toLowerCase() === owner.toLowerCase()) {
          results.push(p);
        }
      } catch { /* profile may not exist */ }
    }
    return results;
  } catch {
    return [];
  }
}

// get_due_sources(u64, u32, u32) fails — reconstruct from getSources + timestamp check
export async function getDueSources(client: WatchtowerClient, nowTs: number, _offset = 0, _limit = 50): Promise<string[]> {
  try {
    const sources = await getSources(client);
    return sources
      .filter((s) => s.active && nowTs >= s.next_due_at && nowTs >= s.cooldown_until)
      .map((s) => s.source_id);
  } catch {
    return [];
  }
}

// is_scan_due(str, u64) fails — check locally
export async function isScanDue(client: WatchtowerClient, sourceId: string, nowTs: number): Promise<boolean> {
  try {
    const s = await getSource(client, sourceId);
    return s.active && nowTs >= s.next_due_at && nowTs >= s.cooldown_until;
  } catch {
    return false;
  }
}
