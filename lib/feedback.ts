export interface FeedbackEntry {
  videoId: string;
  channelId: string;
  rating: "helpful" | "not_helpful";
  editedComment?: string;
  timestamp: number;
}

// In production replace this with a Vercel Postgres / Upstash Redis call
const feedbackStore: FeedbackEntry[] = [];

export function storeFeedback(entry: FeedbackEntry) {
  feedbackStore.push(entry);
}

export function getFeedbackSummary() {
  const total = feedbackStore.length;
  const helpful = feedbackStore.filter((f) => f.rating === "helpful").length;
  return { total, helpful, accuracy: total ? Math.round((helpful / total) * 100) : 0 };
}
