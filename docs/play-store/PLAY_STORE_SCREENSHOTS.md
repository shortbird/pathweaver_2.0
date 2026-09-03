# Play Store Screenshot Capture Guide

Eight phone screenshots is the sweet spot — enough to show the breadth of Optio without overwhelming. Capture from a **real production build** on an Android device (or emulator running the AAB).

## Tool setup for clean shots

### Option 1 — Android Demo Mode (recommended)

Demo Mode forces a clean status bar with consistent time, full battery, full signal. Connect your phone via USB with ADB enabled, then:

```bash
adb shell settings put global sysui_demo_allowed 1

# Set clean status bar: 9:41 AM (Apple's traditional screenshot time), full bars
adb shell am broadcast -a com.android.systemui.demo -e command enter
adb shell am broadcast -a com.android.systemui.demo -e command clock -e hhmm 0941
adb shell am broadcast -a com.android.systemui.demo -e command battery -e level 100 -e plugged false
adb shell am broadcast -a com.android.systemui.demo -e command network -e mobile show -e level 4 -e datatype none
adb shell am broadcast -a com.android.systemui.demo -e command notifications -e visible false

# When done:
adb shell am broadcast -a com.android.systemui.demo -e command exit
```

### Option 2 — Android Emulator

Quicker, but doesn't show real device feel. Android Studio's emulator has a built-in clean status bar mode in extended controls.

### Option 3 — Just take screenshots and crop the status bar

Use Photoshop, Figma, or Preview to crop the status bar area, then frame on a neutral background.

## What to capture (in order)

Match this order in Play Console — the first 2-3 are most-viewed.

### 1. Hero shot: Quest discovery
The purple-to-pink gradient hero in the Quests tab is your most visually striking surface. Lead with it.
- Tap the Quests tab
- Scroll so the gradient banner is fully visible
- Make sure 3-4 quest cards are visible below it

### 2. Capture sheet open
Shows the core action and immediately conveys "this app is about capturing learning."
- Tap the center Capture button on the tab bar
- Take the screenshot with the sheet open, showing Camera/Photo/Voice/Files options
- Description field can have placeholder "What did you learn?"

### 3. Journal with moments
Shows what students get out of using the app — a portfolio of moments over time.
- Tap Journal tab
- Make sure there are 3-5 sample moments showing variety (text, image, video)
- A good engagement calendar at top is bonus

### 4. Profile with pillar XP
Shows the gamification + pillar system; reads as "growth across multiple dimensions."
- Tap profile avatar → Profile
- Scroll so pillar XP breakdown is visible
- Engagement rhythm badge visible is a plus

### 5. Family dashboard
For parents — shows that Optio is family-oriented, not just student-facing.
- Switch to Preview as Parent (or log in as parent)
- Family tab with a child selected
- Hero card + quick actions row visible

### 6. Bounty creation
For parents/advisors/observers — shows that adults can set learning challenges.
- Quests tab → Bounties segment → Posted → Post Bounty
- Or just the Browse view with a few bounty cards visible
- Captures the "create your own challenges" angle

### 7. Feed
Shows the social-but-private feed of moments.
- Feed tab
- 2-3 feed cards visible with pillar badges + comment counts

### 8. Observer view
Shows that observers (extended family / mentors) can support a student's journey.
- Switch to Preview as Observer
- Activity tab with the Students segment selected, or a per-student overview screen

## Image specs reminder

- **Format**: PNG or JPG
- **Min size**: 320px on the smallest side
- **Max size**: 3840px on the longest side
- **Aspect ratio**: between 16:9 and 9:16 (portrait phone screenshots are 9:16 ≈ 1080×1920)
- **File size**: under 8 MB each

## Feature graphic (separate from screenshots)

This is the wide banner at the top of your Play Store listing — 1024×500. Make it distinct:

- Brand-forward: Optio logo + tagline "The process is the goal." on the gradient (#6D469B → #EF597B)
- No essential content within 80px of the edges (Google may overlay UI elements)
- Tools: Figma free template, or Canva's "Google Play Feature Graphic" preset
- Export as PNG

## App icon

- **Source**: `frontend-v2/assets/images/icon.png` (you have this, 1024×1024)
- **Required output**: 512×512 PNG, < 1 MB
- Resize with any image tool — `sips -z 512 512 icon.png --out icon-512.png` on macOS, Photoshop on Windows
