const fs = require("fs");
const path = require("path");

const manifestPath = path.join(
  __dirname,
  "../android/app/src/main/AndroidManifest.xml"
);

let manifest = fs.readFileSync(manifestPath, "utf8");

// Ensure tools namespace exists
if (!manifest.includes('xmlns:tools="http://schemas.android.com/tools"')) {
  manifest = manifest.replace(
    "<manifest",
    '<manifest xmlns:tools="http://schemas.android.com/tools"'
  );
}

// Helper to patch meta-data tag with tools:replace
function addToolsReplace(name, replaceAttr) {
  const regex = new RegExp(
    `<meta-data[^>]*android:name="${name}"([^>]*)/>`,
    "g"
  );
  manifest = manifest.replace(regex, (match, group) => {
    if (match.includes("tools:replace")) return match; // already patched
    return match.replace(
      group,
      `${group} tools:replace="android:${replaceAttr}"`
    );
  });
}

// Your 3 replacements
addToolsReplace(
  "com.google.firebase.messaging.default_notification_channel_id",
  "value"
);
addToolsReplace(
  "com.google.firebase.messaging.default_notification_color",
  "resource"
);
addToolsReplace(
  "expo.modules.notifications.default_notification_color",
  "resource"
);

fs.writeFileSync(manifestPath, manifest);
console.log("✅ AndroidManifest.xml patched successfully.");
