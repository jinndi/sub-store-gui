const { copyFile, mkdir } = require("node:fs/promises");
const path = require("node:path");

module.exports = async function includePackageManifests(context) {
  const projectDir = path.resolve(__dirname, "..");
  const sourceDir = path.join(
    context.packager.getResourcesDir(context.appOutDir),
    "source",
  );

  await mkdir(path.join(sourceDir, "app"), { recursive: true });
  await Promise.all([
    copyFile(path.join(projectDir, "package.json"), path.join(sourceDir, "package.json")),
    copyFile(
      path.join(projectDir, "app", "package.json"),
      path.join(sourceDir, "app", "package.json"),
    ),
  ]);
};
