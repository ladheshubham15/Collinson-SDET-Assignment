const common = {
  requireModule: ["ts-node/register"],
  require: ["src/support/**/*.ts", "features/step-definitions/**/*.ts"],
  format: ["progress", "summary"],
  parallel: 1
};

module.exports = {
  // Spec suite: runs against the real API (ACTIVITY_RANKING_API_URL). Red until an implementation exists.
  default: { ...common, paths: ["features/*.feature"] },
  // Mock suite: runs against an in-process mock API + Open-Meteo stub. Green; proves the steps work.
  mock: { ...common, paths: ["features/mock/*.feature"] }
};
