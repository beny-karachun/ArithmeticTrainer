# Brainbreak

Brainbreak is a local-first Chrome extension that interrupts browsing with short, adaptive arithmetic and memory sets. The blocker has no skip or close control: complete the configured number of challenges to continue browsing.

## Install locally

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select `/home/benyIL123/Desktop/Vibe projects/ArithmeticTrainer/`.

The dashboard opens after installation. Use **Start a practice set** to test immediately, or wait for the configured interval.

## Training options

- Addition
- Subtraction
- Multiplication
- Exact integer division
- Ordered number recall
- Sentence recall
- 3–20 challenges per set
- Independent reminder intervals from 1 minute to 24 hours
- Pause/resume scheduling without losing progress

Any combination of the six skills can be enabled. At least one skill must remain selected.

## Adaptive difficulty

Each skill owns an independent level from 1 to 12 and a six-point mastery meter.

- A quick first-try answer earns two mastery points.
- A slower first-try answer earns one point.
- An answer that needs a retry removes one point.
- Six mastery points raise that skill by one level.
- Repeated difficulty can lower a level so the challenge stays useful.

Arithmetic levels expand number size, operand count, signed values, and factor ranges. Number recall grows from 5 to 16 digits across the standard levels, while sentence recall introduces longer, more detailed sentences and shorter study windows.

## Reminder behavior

- Chrome alarms schedule one repeating training routine.
- When an alarm fires, Brainbreak blocks every eligible open webpage.
- Completing the set in one tab records it once and clears the blocker from the other tabs.
- Chrome-protected pages such as `chrome://...` cannot host extensions. If no normal webpage is available, the extension badge shows a pending set and the blocker appears on the next eligible page.
- Scheduled alarms run only while Chrome is available and may resume late after sleep.

Settings, adaptive profiles, and the latest 1,000 session summaries stay in `chrome.storage.local`. No account, server, or network access is used.

## Development checks

Run the deterministic trainer tests with:

```bash
node tests/trainer.test.js
```
