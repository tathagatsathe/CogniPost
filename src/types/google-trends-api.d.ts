declare module "google-trends-api" {
  interface TrendsOptions {
    geo?: string;
  }
  const googleTrends: {
    dailyTrends: (options: TrendsOptions) => Promise<string>;
  };
  export default googleTrends;
}
