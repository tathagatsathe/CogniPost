export interface TrendCandidate {
  name: string;
  source: "x" | "google";
  hashtags?: string[];
  tweetVolume?: number;
}
