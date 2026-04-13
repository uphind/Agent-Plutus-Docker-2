export const TOOLTIPS = {
  // Dashboard overview
  totalSpend: "Total cost across all providers for the selected time period.",
  activeUsers: "Users who made at least one API request in the selected period.",
  totalRequests: "Total number of API requests across all providers.",
  avgCostPerUser: "Total spend divided by the number of active users.",

  // Forecasting
  projectedSpend: "Estimated total spend for the next 30 days based on linear regression of historical daily spend.",
  dailyTrend: "The slope of the linear regression line — how much daily spend is increasing or decreasing on average. R² indicates model fit quality.",
  weekOverWeek: "Percentage change in total spend between the most recent 7 days and the prior 7 days.",
  weekendRatio: "Average weekend spend as a percentage of average weekday spend. Lower values indicate less weekend usage.",
  budgetExhaustion: "Projects when each department's monthly budget will run out based on the current daily burn rate.",
  whatIfSimulator: "Estimates additional monthly cost if new users are added, based on current average cost per user.",

  // Seat / User Optimization
  totalSeats: "Total number of users with active accounts in the system.",
  avgUtilization: "Average utilization score across all users. Based on the ratio of active days to total days in the period.",
  potentialSavings: "Estimated monthly savings if idle and low-usage seats are optimized or removed.",
  multiProviderUsers: "Users who have generated usage across two or more AI providers.",
  engagementDistribution: "Breakdown of users by engagement level: Active (daily use), Moderate (regular use), Low (occasional use), and Idle (no recent activity).",
  utilizationScore: "Percentage of days a user was active in the selected period. 100% means activity every day.",

  // Analytics
  modelsUsed: "Total distinct AI models used across all providers in the selected period.",
  totalSpendAnalytics: "Sum of all API costs for the selected time range and provider filter.",
  totalRequestsAnalytics: "Total API requests made across the selected time range.",
  dataPoints: "Number of time intervals (daily, weekly, etc.) with recorded usage data.",
  spendByProvider: "Cost breakdown by AI provider. Click a provider to filter the entire page.",
  spendByModel: "Cost breakdown by individual AI model. Shows the top models by spend.",
  modelShare: "Each model's percentage of total spend over time — shows how model usage shifts.",
  costEfficiency: "Average cost per request over time — lower values indicate more cost-efficient usage.",

  // Explorer
  costExplorer: "Slice and dice spend data by any combination of provider, model, department, team, or user.",

  // Reports
  projectedMonthEnd: "Extrapolation of current month's spend to the end of the month, based on the daily burn rate so far.",
  dailyBurnRate: "Average spend per day in the current month so far.",

  // Benchmarks
  peerComparison: "How your organization's AI spend compares to industry peers of similar size.",

  // Provider Health
  syncHealth: "Status of the most recent data sync for each provider. Failures may indicate API key issues.",
} as const;
