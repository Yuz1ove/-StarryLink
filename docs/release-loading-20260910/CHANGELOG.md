# StarryLink branded scene loading

Scene entry now uses the existing StarryLink star and directional SVG light tracks, with disaster/war preparation copy. The parser shell is styled before module loading and continues its animation when the application mounts. Scene navigation requests begin immediately.

Only a validated first-frame receipt starts the short directional reveal. Preserve scenario/run/hash/snapshot identity checks, zero-size and context-loss protection, 12-second recovery bounds, retry deduplication and renderer disposal. Keep navigation available while unready scene controls are disabled. Reduced motion uses static branding; loader animations and reveal listeners are cleaned up.

This release includes the prerequisite loading repair and its browser regression suite. It does not modify scene modeling, lighting, communication decisions or ARCI integrations.

Validation commands: `npm run build`; `QA_BASE=http://127.0.0.1:8883/ QA_OUT=<new-output-directory> node demo/v2/coastal-loading-browser.test.mjs`. The browser suite covers both scenes, repeated/rapid navigation, cold and cached loading, mobile emulation, reduced motion, real request failures, retry, context loss, timeouts and invalid-size frames.
