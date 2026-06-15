"use server";

import { getAuthUser } from "./auth";
import type { ActionResult } from "./types";
import type { Lead } from "@/types/leads";
import type { Tables } from "@/types/database";
import { DEFAULT_SETTINGS } from "@/lib/constants";
import { mapDbLeadToLead } from "@/lib/mappers";

export interface DashboardData {
  today: {
    actionsTotal: number;
    actionsPending: number;
    actionsValidated: number;
    actionsSent: number;
  };
  quotas: {
    invitations: { used: number; limit: number };
    messages: { used: number; limit: number };
    visits: { used: number; limit: number };
  };
  unreadResponses: number;
  hotLeads: Lead[];
  pipeline: {
    stages: { name: string; count: number; color: string }[];
  };
  responseRate: {
    rate: number;
    sent: number;
    responded: number;
  };
}

export interface TeamMember {
  id: string;
  name: string;
  initials: string;
  stats: {
    actionsThisWeek: number;
    responseRate: number;
    leadsAdded: number;
    meetings: number;
  };
}

const STAGE_CONFIG = [
  { key: "to_invite", name: "À inviter", color: "#94a3b8" },
  { key: "invited", name: "Invité", color: "#60a5fa" },
  { key: "connected", name: "Connecté", color: "#34d399" },
  { key: "in_sequence", name: "En séquence", color: "#fbbf24" },
  { key: "responded", name: "A répondu", color: "#f97316" },
  { key: "meeting", name: "RDV", color: "#ef4444" },
];

export async function getDashboardData(): Promise<
  ActionResult<DashboardData>
> {
  try {
    const { supabase } = await getAuthUser();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Today's actions (RLS: owner only)
    const { data: todayActions } = await supabase
      .from("actions")
      .select("status, action_type")
      .gte("created_at", today.toISOString())
      .lt("created_at", tomorrow.toISOString());

    const actions = todayActions ?? [];
    const todayStats = {
      actionsTotal: actions.length,
      actionsPending: actions.filter((a) => a.status === "pending").length,
      actionsValidated: actions.filter((a) => a.status === "validated").length,
      actionsSent: actions.filter((a) => a.status === "sent").length,
    };

    const sentOrValidated = actions.filter(
      (a) => a.status === "sent" || a.status === "validated"
    );
    const quotas = {
      invitations: {
        used: sentOrValidated.filter((a) => a.action_type === "invitation")
          .length,
        limit: DEFAULT_SETTINGS.daily_invitations_limit,
      },
      messages: {
        used: sentOrValidated.filter(
          (a) =>
            a.action_type === "message" || a.action_type === "inmail"
        ).length,
        limit: DEFAULT_SETTINGS.daily_messages_limit,
      },
      visits: {
        used: sentOrValidated.filter((a) => a.action_type === "visit").length,
        limit: DEFAULT_SETTINGS.daily_visits_limit,
      },
    };

    // Unread conversations (RLS: owner only)
    const { count: unreadCount } = await supabase
      .from("conversations")
      .select("*", { count: "exact", head: true })
      .eq("status", "unread");

    // Hot leads (pool partagé: SELECT all)
    const { data: hotLeadRows } = await supabase
      .from("leads")
      .select("*")
      .gte("score", DEFAULT_SETTINGS.hot_lead_threshold)
      .order("score", { ascending: false })
      .limit(5);

    // Pipeline stage counts (pool partagé)
    const { data: allLeads } = await supabase
      .from("leads")
      .select("stage");

    const stageCounts = new Map<string, number>();
    for (const lead of allLeads ?? []) {
      stageCounts.set(lead.stage, (stageCounts.get(lead.stage) ?? 0) + 1);
    }

    const pipeline = {
      stages: STAGE_CONFIG.map((s) => ({
        name: s.name,
        count: stageCounts.get(s.key) ?? 0,
        color: s.color,
      })),
    };

    // Response rate: messages/inmails sent vs conversations with inbound messages
    const { count: totalSent } = await supabase
      .from("actions")
      .select("*", { count: "exact", head: true })
      .in("action_type", ["message", "inmail"])
      .eq("status", "sent");

    const { count: totalResponded } = await supabase
      .from("conversations")
      .select("*", { count: "exact", head: true });

    const sent = totalSent ?? 0;
    const responded = totalResponded ?? 0;
    const responseRate = {
      rate: sent > 0 ? Math.round((responded / sent) * 100) : 0,
      sent,
      responded,
    };

    return {
      success: true,
      data: {
        today: todayStats,
        quotas,
        unreadResponses: unreadCount ?? 0,
        hotLeads: ((hotLeadRows ?? []) as Tables<"leads">[]).map(mapDbLeadToLead),
        pipeline,
        responseRate,
      },
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function getTeamData(): Promise<ActionResult<TeamMember[]>> {
  try {
    const { supabase } = await getAuthUser();

    // Profiles (SELECT all via RLS)
    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("id, full_name");

    if (error) throw error;

    // Leads (pool partagé: SELECT all) — group by user_id
    const { data: allLeads } = await supabase
      .from("leads")
      .select("user_id, stage, created_at");

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const members: TeamMember[] = (profiles ?? []).map((profile) => {
      const name = profile.full_name ?? "Inconnu";
      const initials = name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);

      const userLeads = (allLeads ?? []).filter(
        (l) => l.user_id === profile.id
      );
      const leadsThisWeek = userLeads.filter(
        (l) => new Date(l.created_at) >= weekAgo
      );
      const meetings = userLeads.filter((l) => l.stage === "meeting");

      return {
        id: profile.id,
        name,
        initials,
        stats: {
          actionsThisWeek: 0, // Actions RLS owner-only, sera compute quand on aura un RPC
          responseRate: 0,
          leadsAdded: leadsThisWeek.length,
          meetings: meetings.length,
        },
      };
    });

    return { success: true, data: members };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
