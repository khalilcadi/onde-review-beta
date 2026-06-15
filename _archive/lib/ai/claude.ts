// Placeholder - Claude API client
// Will be implemented in Phase 3

export const generateMessage = async (
  prompt: string,
  context: Record<string, unknown>
) => {
  // TODO: Implement Claude message generation
  console.log("Claude API placeholder");
  return "Message généré par Claude (placeholder)";
};

export const scoreLead = async (leadData: Record<string, unknown>) => {
  // TODO: Implement Claude lead scoring
  console.log("Claude scoring placeholder");
  return Math.floor(Math.random() * 100);
};
