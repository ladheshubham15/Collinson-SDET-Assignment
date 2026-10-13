module.exports = {
  default: {
    requireModule: ["ts-node/register"],
    require: ["src/support/**/*.ts", "features/step-definitions/**/*.ts"],
    paths: ["features/**/*.feature"],
    format: ["progress", "summary"],
    publishQuiet: true,
    parallel: 1
  }
};
