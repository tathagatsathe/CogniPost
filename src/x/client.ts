import {
  TwitterApi,
  type TwitterApiReadWrite,
  type TweetV2,
} from "twitter-api-v2";
import type { EnvConfig } from "../config/types.js";
import { log } from "../utils/logger.js";

export interface PostedTweet {
  id: string;
  text: string;
}

export class XClient {
  private client: TwitterApiReadWrite;
  private userId: string | null = null;

  constructor(private env: EnvConfig) {
    if (env.xAccessToken) {
      this.client = new TwitterApi(env.xAccessToken).readWrite;
    } else if (
      env.xApiKey &&
      env.xApiSecret &&
      env.xAccessTokenOAuth1 &&
      env.xAccessSecret
    ) {
      this.client = new TwitterApi({
        appKey: env.xApiKey,
        appSecret: env.xApiSecret,
        accessToken: env.xAccessTokenOAuth1,
        accessSecret: env.xAccessSecret,
      }).readWrite;
    } else {
      throw new Error(
        "X credentials missing. Set OAuth 2.0 tokens or OAuth 1.0a keys in .env"
      );
    }
  }

  async getMe(): Promise<{ id: string; username: string }> {
    const me = await this.client.v2.me();
    this.userId = me.data.id;
    return { id: me.data.id, username: me.data.username };
  }

  async getRecentTweets(maxResults = 30): Promise<string[]> {
    if (!this.userId) {
      await this.getMe();
    }
    const timeline = await this.client.v2.userTimeline(this.userId!, {
      max_results: Math.min(maxResults, 100),
      "tweet.fields": ["text"],
      exclude: ["retweets", "replies"],
    });
    const texts: string[] = [];
    for await (const tweet of timeline) {
      if (tweet.text) texts.push(tweet.text);
    }
    return texts;
  }

  async postTweet(text: string): Promise<PostedTweet> {
    log("info", "Posting tweet to X", { length: text.length });
    const result = await this.client.v2.tweet(text);
    const data = result.data as TweetV2;
    log("info", "Tweet posted", { tweetId: data.id });
    return { id: data.id, text };
  }

  getOAuth2Client(): TwitterApi {
    if (!this.env.xClientId || !this.env.xClientSecret) {
      throw new Error("X_CLIENT_ID and X_CLIENT_SECRET required for OAuth2");
    }
    return new TwitterApi({
      clientId: this.env.xClientId,
      clientSecret: this.env.xClientSecret,
    });
  }
}

export function hasXCredentials(env: EnvConfig): boolean {
  const oauth2 =
    env.xClientId &&
    env.xClientSecret &&
    env.xAccessToken;
  const oauth1 =
    env.xApiKey &&
    env.xApiSecret &&
    env.xAccessTokenOAuth1 &&
    env.xAccessSecret;
  return Boolean(oauth2 || oauth1);
}
