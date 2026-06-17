#!/usr/bin/env bash
# Regenerate the brand stylesheet that cfg.cssEntry (frontend/.ds-styles.css) points at.
# RUN THIS BEFORE package-build.mjs on every (re)sync — the output is gitignored.
#
# Why: pathweaver's frontend is a Vite APP, not a packaged DS, so it ships no
# component stylesheet. We compile one with Tailwind from the app's own config +
# the ui components, plus a brand-token safelist (pillars/gradients the 15
# components don't all use but the design agent should be able to build with).
set -euo pipefail
cd "$(dirname "$0")/../frontend"

# 1. brand-token safelist (so Tailwind emits the full Optio palette)
node -e '
const colors = ["optio-purple","optio-purple-dark","optio-purple-light","optio-pink","optio-pink-dark",
  "pillar-stem","pillar-stem-light","pillar-stem-dark","pillar-art","pillar-art-light","pillar-art-dark",
  "pillar-communication","pillar-communication-light","pillar-communication-dark",
  "pillar-wellness","pillar-wellness-light","pillar-wellness-dark","pillar-civics","pillar-civics-light","pillar-civics-dark"];
const gradients = ["bg-gradient-primary","bg-gradient-pillar-stem","bg-gradient-pillar-art","bg-gradient-pillar-communication","bg-gradient-pillar-wellness","bg-gradient-pillar-civics"];
const out = [];
for (const c of colors) out.push("bg-"+c,"text-"+c,"border-"+c,"from-"+c,"to-"+c);
out.push(...gradients);
require("fs").writeFileSync(".ds-brand-safelist.html", out.map(c=>`<i class="${c}"></i>`).join("\n")+"\n");
'

# 2. compile (ONE comma-separated --content; two --content flags override!)
node_modules/.bin/tailwindcss -c tailwind.config.js -i src/index.css -o .ds-styles.gen.css \
  --content './src/components/ui/**/*.{js,jsx},./.ds-brand-safelist.html'

# 3. prepend the brand webfonts (Poppins/Inter load at runtime via remote @import)
printf "%s\n" "@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap');" > .ds-styles.css
cat .ds-styles.gen.css >> .ds-styles.css
rm -f .ds-styles.gen.css
echo "wrote frontend/.ds-styles.css ($(wc -c < .ds-styles.css) bytes)"
