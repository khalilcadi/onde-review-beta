"use client";

import { Users, Trophy, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { TeamMember } from "@/lib/actions/dashboard";

interface TeamClientProps {
  members: TeamMember[];
}

export function TeamClient({ members }: TeamClientProps) {
  const sortedMembers = [...members].sort(
    (a, b) => b.stats.meetings - a.stats.meetings
  );

  const totalLeads = members.reduce((sum, m) => sum + m.stats.leadsAdded, 0);
  const totalMeetings = members.reduce((sum, m) => sum + m.stats.meetings, 0);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold">&Eacute;quipe</h1>
        <p className="text-muted-foreground">
          Performance de l&apos;&eacute;quipe PROSPECTOR
        </p>
      </div>

      {/* Team Stats Overview */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Users className="h-8 w-8 text-muted-foreground" />
              <div>
                <div className="text-2xl font-semibold">{members.length}</div>
                <div className="text-sm text-muted-foreground">Membres</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <TrendingUp className="h-8 w-8 text-green-500" />
              <div>
                <div className="text-2xl font-semibold">{totalLeads}</div>
                <div className="text-sm text-muted-foreground">Leads ajout&eacute;s (7j)</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Trophy className="h-8 w-8 text-amber-500" />
              <div>
                <div className="text-2xl font-semibold">{totalMeetings}</div>
                <div className="text-sm text-muted-foreground">RDV total</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Leaderboard */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-500" />
            Leaderboard
          </CardTitle>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              Aucun membre trouv&eacute;
            </p>
          ) : (
            <div className="space-y-4">
              {sortedMembers.map((member, index) => (
                <div
                  key={member.id}
                  className="flex items-center gap-4 p-4 rounded-lg border"
                >
                  {/* Rank */}
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full font-semibold text-sm ${
                      index === 0
                        ? "bg-amber-100 text-amber-700"
                        : index === 1
                        ? "bg-gray-100 text-gray-700"
                        : index === 2
                        ? "bg-orange-100 text-orange-700"
                        : "bg-muted"
                    }`}
                  >
                    {index + 1}
                  </div>

                  {/* Avatar & Info */}
                  <div className="flex items-center gap-3 flex-1">
                    <Avatar>
                      <AvatarFallback>{member.initials}</AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-medium">{member.name}</div>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-6 text-center">
                    <div>
                      <div className="text-lg font-semibold">
                        {member.stats.leadsAdded}
                      </div>
                      <div className="text-xs text-muted-foreground">Leads (7j)</div>
                    </div>
                    <div>
                      <div className="text-lg font-semibold text-green-600">
                        {member.stats.meetings}
                      </div>
                      <div className="text-xs text-muted-foreground">RDV</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
