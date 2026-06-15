"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CheckSquare,
  MessageSquare,
  TrendingUp,
  Users,
  Flame,
  BarChart3,
  ArrowRight,
  Trophy,
  Target,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { DashboardData, TeamMember } from "@/lib/actions/dashboard";
import type { Lead } from "@/types/leads";

// Simple sparkline component
function Sparkline({ data, color = "#3B82F6" }: { data: number[]; color?: string }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const height = 40;
  const width = 120;
  const points = data
    .map((value, index) => {
      const x = (index / (data.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
      <circle
        cx={(data.length - 1) / (data.length - 1) * width}
        cy={height - ((data[data.length - 1] - min) / range) * height}
        r="3"
        fill={color}
      />
    </svg>
  );
}

// Pipeline funnel chart
function FunnelChart({ stages }: { stages: { name: string; count: number; color: string }[] }) {
  const maxCount = Math.max(...stages.map((s) => s.count));

  return (
    <div className="space-y-4">
      {stages.map((stage) => (
        <div key={stage.name} className="flex items-center gap-4">
          <div className="w-28 text-sm font-medium text-muted-foreground truncate">{stage.name}</div>
          <div className="flex-1 h-9 bg-muted rounded-lg overflow-hidden">
            <div
              className="h-full rounded-lg flex items-center px-3 text-xs font-semibold text-white transition-all duration-500"
              style={{
                width: `${maxCount > 0 ? (stage.count / maxCount) * 100 : 0}%`,
                backgroundColor: stage.color,
                minWidth: "50px",
              }}
            >
              {stage.count}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Team pie chart (simple CSS-based)
function TeamPieChart({ data }: { data: { name: string; value: number; color: string }[] }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  let currentAngle = 0;

  const segments = data.map((d) => {
    const angle = total > 0 ? (d.value / total) * 360 : 0;
    const segment = { ...d, startAngle: currentAngle, endAngle: currentAngle + angle };
    currentAngle += angle;
    return segment;
  });

  return (
    <div className="flex items-center gap-8">
      <div
        className="w-36 h-36 rounded-full relative"
        style={{
          background: total > 0
            ? `conic-gradient(${segments
                .map((s) => `${s.color} ${s.startAngle}deg ${s.endAngle}deg`)
                .join(", ")})`
            : "#e5e5e5",
        }}
      >
        <div className="absolute inset-4 bg-card rounded-full flex items-center justify-center">
          <span className="text-xl font-semibold">{total}</span>
        </div>
      </div>
      <div className="space-y-3">
        {data.map((d) => (
          <div key={d.name} className="flex items-center gap-3 text-sm">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }} />
            <span className="text-muted-foreground">{d.name}:</span>
            <span className="font-semibold">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface DashboardClientProps {
  dashboard: DashboardData;
  team: TeamMember[];
  userName?: string;
}

export default function DashboardClient({ dashboard, team, userName = "Utilisateur" }: DashboardClientProps) {
  const [view, setView] = useState<"personal" | "team">("personal");

  const hotLeads: Lead[] = dashboard.hotLeads;
  const teamLeadsData = team.map((member, i) => ({
    name: member.name,
    value: member.stats.leadsAdded,
    color: ["#3B82F6", "#10B981", "#F59E0B"][i % 3],
  }));

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Bonjour {userName}, voici votre r&eacute;capitulatif du jour
          </p>
        </div>
        <Tabs value={view} onValueChange={(v) => setView(v as "personal" | "team")}>
          <TabsList className="bg-muted rounded-lg p-1">
            <TabsTrigger value="personal" className="rounded-md px-4">Mon activit&eacute;</TabsTrigger>
            <TabsTrigger value="team" className="rounded-md px-4">&Eacute;quipe</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {view === "personal" ? (
        <>
          {/* Personal Stats Cards - KPI Grid */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {/* Actions du jour */}
            <Card className="transition-all duration-200 p-6">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                  <CheckSquare className="h-5 w-5 text-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-muted-foreground">Actions du jour</p>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-3xl font-semibold">{dashboard.today.actionsValidated}</span>
                    <span className="text-muted-foreground text-sm">/ {dashboard.today.actionsTotal}</span>
                  </div>
                </div>
              </div>
              <div className="mt-4">
                <Progress
                  value={dashboard.today.actionsTotal > 0 ? (dashboard.today.actionsValidated / dashboard.today.actionsTotal) * 100 : 0}
                  className="h-2 rounded-full"
                  indicatorClassName="bg-success rounded-full"
                />
              </div>
              <div className="flex items-center text-xs text-muted-foreground mt-3">
                <Badge variant="warning" className="mr-1.5">{dashboard.today.actionsPending}</Badge>
                en attente de validation
              </div>
            </Card>

            {/* Reponses non lues */}
            <Card className="transition-all duration-200 p-6">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10">
                  <MessageSquare className="h-5 w-5 text-destructive" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-muted-foreground">R&eacute;ponses non trait&eacute;es</p>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-3xl font-semibold">{dashboard.unreadResponses}</span>
                    {dashboard.unreadResponses > 0 && (
                      <Badge variant="destructive" className="animate-pulse">Nouveau</Badge>
                    )}
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-4">
                Nouvelles conversations &agrave; traiter
              </p>
              <Link href="/inbox">
                <Button variant="link" className="p-0 h-auto text-xs mt-1 text-accent">
                  Voir l&apos;inbox <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </Link>
            </Card>

            {/* Leads chauds */}
            <Card className="transition-all duration-200 p-6">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning-light">
                  <Flame className="h-5 w-5 text-warning" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-muted-foreground">Leads chauds</p>
                  <div className="text-3xl font-semibold mt-1">{hotLeads.length}</div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">Score &gt; 70</p>
              <div className="flex -space-x-2 mt-3">
                {hotLeads.slice(0, 4).map((lead) => (
                  <Avatar key={lead.id} className="h-8 w-8 border-2 border-card">
                    <AvatarFallback className="text-xs bg-warning-light text-warning">
                      {lead.displayName.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                ))}
                {hotLeads.length > 4 && (
                  <div className="h-8 w-8 rounded-full bg-muted border-2 border-card flex items-center justify-center text-xs font-medium">
                    +{hotLeads.length - 4}
                  </div>
                )}
              </div>
            </Card>

            {/* Taux de reponse */}
            <Card className="transition-all duration-200 p-6">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success-light">
                  <TrendingUp className="h-5 w-5 text-success" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-muted-foreground">Taux de r&eacute;ponse</p>
                  <div className="text-3xl font-semibold mt-1">{dashboard.responseRate.rate}%</div>
                </div>
              </div>
              <div className="flex items-center justify-between mt-3">
                <p className="text-xs text-muted-foreground">
                  {dashboard.responseRate.responded} r&eacute;ponses / {dashboard.responseRate.sent} envoy&eacute;s
                </p>
              </div>
            </Card>
          </div>

          {/* Two Column Layout */}
          <div className="grid gap-8 lg:grid-cols-2">
            {/* Pipeline Funnel */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-4">
                <CardTitle className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                    <BarChart3 className="h-4 w-4 text-accent" />
                  </div>
                  Pipeline par &eacute;tape
                </CardTitle>
                <Link href="/pipeline">
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                    Voir tout <ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent>
                <FunnelChart stages={dashboard.pipeline.stages} />
              </CardContent>
            </Card>

            {/* Hot Leads */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-4">
                <CardTitle className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-warning-light">
                    <Flame className="h-4 w-4 text-warning" />
                  </div>
                  Leads prioritaires
                </CardTitle>
                <Link href="/pipeline?status=hot">
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                    Voir tout <ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {hotLeads.map((lead) => (
                    <Link key={lead.id} href={`/pipeline/${lead.id}`}>
                      <div className="flex items-center justify-between rounded-lg bg-muted/50 p-4 transition-all duration-200 hover:bg-muted hover:shadow-sm cursor-pointer">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10">
                            <AvatarFallback className="bg-muted text-foreground text-sm font-semibold">
                              {lead.displayName.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-medium">{lead.displayName}</div>
                            <div className="text-sm text-muted-foreground">
                              {lead.title} @ {lead.company}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge
                            variant={lead.status === "hot" ? "destructive" : "warning"}
                            className="rounded-full"
                          >
                            {lead.status === "hot" ? "Chaud" : "Tiède"}
                          </Badge>
                          <div className="w-12 text-right">
                            <span className="text-lg font-semibold font-mono">{lead.score}</span>
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Quotas */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                  <Target className="h-4 w-4 text-muted-foreground" />
                </div>
                Quotas LinkedIn du jour
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-8 md:grid-cols-3">
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">Invitations</span>
                    <span className="font-semibold text-accent">
                      {dashboard.quotas.invitations.used}/{dashboard.quotas.invitations.limit}
                    </span>
                  </div>
                  <Progress
                    value={dashboard.quotas.invitations.limit > 0 ? (dashboard.quotas.invitations.used / dashboard.quotas.invitations.limit) * 100 : 0}
                    className="h-3 rounded-full"
                    indicatorClassName="bg-accent rounded-full"
                  />
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">Messages</span>
                    <span className="font-semibold text-success">
                      {dashboard.quotas.messages.used}/{dashboard.quotas.messages.limit}
                    </span>
                  </div>
                  <Progress
                    value={dashboard.quotas.messages.limit > 0 ? (dashboard.quotas.messages.used / dashboard.quotas.messages.limit) * 100 : 0}
                    className="h-3 rounded-full"
                    indicatorClassName="bg-success rounded-full"
                  />
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">Visites profil</span>
                    <span className="font-semibold text-warning">
                      {dashboard.quotas.visits.used}/{dashboard.quotas.visits.limit}
                    </span>
                  </div>
                  <Progress
                    value={dashboard.quotas.visits.limit > 0 ? (dashboard.quotas.visits.used / dashboard.quotas.visits.limit) * 100 : 0}
                    className="h-3 rounded-full"
                    indicatorClassName="bg-warning rounded-full"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <>
          {/* Team View - KPI Grid */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <Card className="transition-all duration-200 p-6">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                  <Users className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Membres</p>
                  <div className="text-3xl font-semibold mt-1">{team.length}</div>
                </div>
              </div>
            </Card>
            <Card className="transition-all duration-200 p-6">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                  <CheckSquare className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Actions / semaine</p>
                  <div className="text-3xl font-semibold mt-1">
                    {team.reduce((sum, m) => sum + m.stats.actionsThisWeek, 0)}
                  </div>
                </div>
              </div>
            </Card>
            <Card className="transition-all duration-200 p-6">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success-light">
                  <TrendingUp className="h-5 w-5 text-success" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Taux r&eacute;ponse moyen</p>
                  <div className="text-3xl font-semibold mt-1">
                    {team.length > 0 ? Math.round(team.reduce((sum, m) => sum + m.stats.responseRate, 0) / team.length) : 0}%
                  </div>
                </div>
              </div>
            </Card>
            <Card className="transition-all duration-200 p-6">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning-light">
                  <Trophy className="h-5 w-5 text-warning" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">RDV cette semaine</p>
                  <div className="text-3xl font-semibold mt-1">
                    {team.reduce((sum, m) => sum + m.stats.meetings, 0)}
                  </div>
                </div>
              </div>
            </Card>
          </div>

          <div className="grid gap-8 lg:grid-cols-2">
            {/* Leaderboard */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-warning-light">
                    <Trophy className="h-4 w-4 text-warning" />
                  </div>
                  Leaderboard
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[...team]
                    .sort((a, b) => b.stats.meetings - a.stats.meetings)
                    .map((member, index) => (
                      <div
                        key={member.id}
                        className="flex items-center gap-4 p-4 rounded-lg bg-muted/50 transition-all duration-200 hover:bg-muted"
                      >
                        <div
                          className={`flex h-9 w-9 items-center justify-center rounded-full font-semibold text-sm ${
                            index === 0
                              ? "bg-warning-light text-warning"
                              : index === 1
                              ? "bg-muted text-muted-foreground"
                              : "bg-warning-light/50 text-warning"
                          }`}
                        >
                          {index + 1}
                        </div>
                        <Avatar>
                          <AvatarFallback className="bg-muted text-accent font-semibold">{member.initials}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <div className="font-medium">{member.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {member.stats.actionsThisWeek} actions &bull; {member.stats.responseRate}% r&eacute;ponses
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-semibold text-success">
                            {member.stats.meetings}
                          </div>
                          <div className="text-xs text-muted-foreground">RDV</div>
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>

            {/* Team Distribution */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                    <Users className="h-4 w-4 text-accent" />
                  </div>
                  R&eacute;partition des leads
                </CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-center py-8">
                <TeamPieChart data={teamLeadsData} />
              </CardContent>
            </Card>
          </div>

          {/* Individual Performance */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle>Performance individuelle</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 md:grid-cols-3">
                {team.map((member) => (
                  <div
                    key={member.id}
                    className="rounded-lg bg-muted/50 p-6 space-y-5 transition-all duration-200 hover:bg-muted hover:shadow-sm"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-12 w-12">
                        <AvatarFallback className="bg-muted text-foreground font-semibold">
                          {member.initials}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium">{member.name}</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <div className="text-muted-foreground">Actions</div>
                        <div className="text-xl font-semibold mt-0.5">{member.stats.actionsThisWeek}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Taux r&eacute;ponse</div>
                        <div className="text-xl font-semibold mt-0.5">{member.stats.responseRate}%</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Leads ajout&eacute;s</div>
                        <div className="text-xl font-semibold mt-0.5">{member.stats.leadsAdded}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">RDV obtenus</div>
                        <div className="text-xl font-semibold mt-0.5 text-success">{member.stats.meetings}</div>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-2">
                        <span className="text-muted-foreground">Objectif hebdo</span>
                        <span className="font-medium">{member.stats.actionsThisWeek}/50</span>
                      </div>
                      <Progress
                        value={(member.stats.actionsThisWeek / 50) * 100}
                        className="h-2 rounded-full"
                        indicatorClassName="bg-accent rounded-full"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
