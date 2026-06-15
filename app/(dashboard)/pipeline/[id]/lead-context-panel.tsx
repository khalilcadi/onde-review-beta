"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Linkedin,
  Briefcase,
  GraduationCap,
  Sparkles,
  Languages,
  Link2,
  ExternalLink,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { LeadEnrichment } from "@/types/leads";

interface LeadContextPanelProps {
  linkedin_profile?: LeadEnrichment["linkedin_profile"];
  person?: LeadEnrichment["person"];
  linkedin_posts?: LeadEnrichment["linkedin_posts"];
}

export function LeadContextPanel({
  linkedin_profile,
  person,
  linkedin_posts,
}: LeadContextPanelProps) {
  const [open, setOpen] = useState(false);

  const hasLinkedinProfile =
    linkedin_profile?.about ||
    (linkedin_profile?.skills && linkedin_profile.skills.length > 0) ||
    (linkedin_profile?.languages && linkedin_profile.languages.length > 0) ||
    (linkedin_profile?.websites && linkedin_profile.websites.length > 0);

  const hasCareer =
    (person?.experience && person.experience.length > 0) ||
    (person?.education && person.education.length > 0) ||
    (linkedin_profile?.education && linkedin_profile.education.length > 0);

  const hasPosts =
    (linkedin_posts && linkedin_posts.length > 0) ||
    (person?.interests && person.interests.length > 0) ||
    (person?.recentPosts && person.recentPosts.length > 0);

  if (!hasLinkedinProfile && !hasCareer && !hasPosts) return null;

  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full p-5 flex items-center gap-2 text-left hover:bg-muted/30 transition-colors"
      >
        <Linkedin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <span className="text-sm font-medium flex-1">Contexte LinkedIn</span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-5 border-t border-border pt-4">
          {/* LinkedIn Profile */}
          {hasLinkedinProfile && (
            <div className="space-y-3">
              {linkedin_profile?.about && (
                <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
                  {linkedin_profile.about}
                </p>
              )}
              {linkedin_profile?.skills && linkedin_profile.skills.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                    <Sparkles className="h-3 w-3" />
                    Compétences
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {linkedin_profile.skills.slice(0, 12).map((skill, i) => (
                      <Badge key={i} variant="outline" className="text-xs rounded-full">
                        {skill.name}
                        {skill.endorsement_count ? ` (${skill.endorsement_count})` : ""}
                      </Badge>
                    ))}
                    {linkedin_profile.skills.length > 12 && (
                      <Badge variant="secondary" className="text-xs rounded-full">
                        +{linkedin_profile.skills.length - 12}
                      </Badge>
                    )}
                  </div>
                </div>
              )}
              {linkedin_profile?.languages && linkedin_profile.languages.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                    <Languages className="h-3 w-3" />
                    Langues
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {linkedin_profile.languages.map((lang, i) => (
                      <Badge key={i} variant="outline" className="text-xs rounded-full">
                        {lang.name}{lang.proficiency ? ` (${lang.proficiency})` : ""}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {linkedin_profile?.websites && linkedin_profile.websites.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
                    <Link2 className="h-3 w-3" />
                    Sites web
                  </p>
                  {linkedin_profile.websites.map((url, i) => (
                    <a
                      key={i}
                      href={url.startsWith("http") ? url : `https://${url}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-accent hover:underline block"
                    >
                      {url}
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Career */}
          {hasCareer && (
            <>
              {hasLinkedinProfile && <Separator />}
              <div>
                <p className="text-xs text-muted-foreground mb-3 flex items-center gap-1">
                  <Briefcase className="h-3 w-3" />
                  Parcours
                </p>
                <div className="space-y-3">
                  {person?.experience?.map((exp, i) => (
                    <div key={i} className="relative pl-4 border-l-2 border-primary/20">
                      <div className="absolute -left-[5px] top-1 h-2 w-2 rounded-full bg-primary" />
                      <div className="font-medium text-sm">{exp.title}</div>
                      <div className="text-sm text-muted-foreground">{exp.company}</div>
                      <div className="text-xs text-muted-foreground">
                        {exp.startDate} - {exp.endDate || "Présent"}
                      </div>
                    </div>
                  ))}
                  {person?.education?.map((edu, i) => (
                    <div key={i} className="relative pl-4 border-l-2 border-muted">
                      <div className="absolute -left-[5px] top-1 h-2 w-2 rounded-full bg-muted-foreground/50" />
                      <div className="flex items-center gap-2">
                        <GraduationCap className="h-3 w-3 text-muted-foreground" />
                        <span className="font-medium text-sm">{edu.school}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {edu.degree}{edu.field ? ` - ${edu.field}` : ""}
                      </div>
                    </div>
                  ))}
                  {!person?.education?.length &&
                    linkedin_profile?.education?.map((edu, i) => (
                      <div key={`lk-edu-${i}`} className="relative pl-4 border-l-2 border-muted">
                        <div className="absolute -left-[5px] top-1 h-2 w-2 rounded-full bg-muted-foreground/50" />
                        <div className="flex items-center gap-2">
                          <GraduationCap className="h-3 w-3 text-muted-foreground" />
                          <span className="font-medium text-sm">{edu.school}</span>
                        </div>
                        {(edu.degree || edu.field) && (
                          <div className="text-xs text-muted-foreground">
                            {edu.degree}{edu.field ? ` - ${edu.field}` : ""}
                          </div>
                        )}
                        {(edu.start_date || edu.end_date) && (
                          <div className="text-xs text-muted-foreground">
                            {edu.start_date}{edu.end_date ? ` - ${edu.end_date}` : ""}
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            </>
          )}

          {/* Posts & Interests */}
          {hasPosts && (
            <>
              {(hasLinkedinProfile || hasCareer) && <Separator />}
              <div className="space-y-3">
                {person?.interests && person.interests.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Centres d&apos;intérêt</p>
                    <div className="flex flex-wrap gap-1.5">
                      {person.interests.map((interest, i) => (
                        <Badge key={i} variant="outline" className="text-xs rounded-full">
                          {interest}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Full LinkedIn posts */}
                {linkedin_posts && linkedin_posts.length > 0 ? (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">
                      Publications récentes LinkedIn
                    </p>
                    <div className="space-y-2">
                      {linkedin_posts.map((post, i) => (
                        <div
                          key={post.social_id || i}
                          className="text-sm bg-muted rounded-lg p-3 space-y-2"
                        >
                          <p className="text-muted-foreground line-clamp-4 whitespace-pre-line">
                            {post.text || "Post sans texte"}
                          </p>
                          <div className="flex items-center justify-between text-xs text-muted-foreground/70">
                            <span>
                              {post.reactions_count ?? 0} réactions · {post.comments_count ?? 0}{" "}
                              commentaires
                              {post.timestamp
                                ? ` · ${new Date(post.timestamp).toLocaleDateString("fr-FR", {
                                    day: "numeric",
                                    month: "short",
                                    year: "numeric",
                                  })}`
                                : ""}
                            </span>
                            {post.share_url && (
                              <a
                                href={post.share_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 hover:underline"
                              >
                                Voir <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : person?.recentPosts && person.recentPosts.length > 0 ? (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">
                      Publications récentes (résumés)
                    </p>
                    <div className="space-y-2">
                      {person.recentPosts.map((post, i) => (
                        <div
                          key={i}
                          className="text-sm text-muted-foreground bg-muted rounded-lg p-3"
                        >
                          <p>&quot;{typeof post === "string" ? post : post.summary}&quot;</p>
                          {typeof post !== "string" && (
                            <p className="text-xs mt-1 opacity-70">
                              {post.reactions} réactions · {post.comments} commentaires
                              {post.date ? ` · ${post.date}` : ""}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
