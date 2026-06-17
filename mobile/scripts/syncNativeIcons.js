/**
 * Regenerate iOS AppIcon and Android mipmap launcher icons from app.json assets.
 * Run after changing icon.png / adaptive-icon.png without a full expo prebuild.
 */
const path = require("path");
const fs = require("fs");
const { getConfig } = require("@expo/config");
const {
  setIconAsync,
  getAdaptiveIcon,
  getIcon,
} = require("@expo/prebuild-config/build/plugins/icons/withAndroidIcons");
const { setIconsAsync } = require("@expo/prebuild-config/build/plugins/icons/withIosIcons");

const projectRoot = path.resolve(__dirname, "..");

async function syncAndroidIcons(config, icon, adaptiveIcon) {
  const androidDir = path.join(projectRoot, "android");
  const {
    backgroundColor,
    backgroundImage,
    monochromeImage,
  } = adaptiveIcon;

  await setIconAsync(projectRoot, {
    icon,
    backgroundColor,
    backgroundImage,
    monochromeImage,
    isAdaptive: !!config.android?.adaptiveIcon,
  });

  const colorsPath = path.join(androidDir, "app/src/main/res/values/colors.xml");
  if (fs.existsSync(colorsPath)) {
    const bg = backgroundColor ?? "#ffffff";
    const colorsXml = fs.readFileSync(colorsPath, "utf8");
    const updated = colorsXml.includes('name="iconBackground"')
      ? colorsXml.replace(
          /<color name="iconBackground">[^<]*<\/color>/,
          `<color name="iconBackground">${bg}</color>`
        )
      : colorsXml.replace(
          "</resources>",
          `  <color name="iconBackground">${bg}</color>\n</resources>`
        );
    fs.writeFileSync(colorsPath, updated);
  }

  console.log("✅ Android launcher icons synced.");
}

async function main() {
  const { exp: config } = getConfig(projectRoot, {
    skipSDKVersionRequirement: true,
    isPublicConfig: true,
  });

  const adaptiveIcon = getAdaptiveIcon(config);
  const icon = adaptiveIcon.foregroundImage ?? getIcon(config);

  if (!icon) {
    console.error("No icon defined in Expo config.");
    process.exit(1);
  }

  const tasks = [];

  if (fs.existsSync(path.join(projectRoot, "android"))) {
    tasks.push(syncAndroidIcons(config, icon, adaptiveIcon));
  } else {
    console.warn("⚠️  android/ not found — skipping Android icons.");
  }

  if (fs.existsSync(path.join(projectRoot, "ios"))) {
    tasks.push(
      setIconsAsync(config, projectRoot).then(() =>
        console.log("✅ iOS AppIcon synced.")
      )
    );
  } else {
    console.warn("⚠️  ios/ not found — skipping iOS icons.");
  }

  await Promise.all(tasks);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
