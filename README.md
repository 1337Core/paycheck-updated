# PayCheck for X

This extension takes inspiration from [Theo's original PayCheck extension](https://github.com/t3dotgg/paycheck-extension) and uses a newer payout algorithm that aims to be more accurate.

## Estimation model

This project is inspired by Theo's original extension, but it no longer uses a single flat `views * constant` payout rule.

It now uses a 2-step model:

1. estimate effective verified views from total views
2. convert those effective verified views into payout using an account base rate

The current estimate is shaped like this:

```js
effectiveVerifiedViews =
  totalViews *
  homeTimelineShare *
  premiumViewerWeight *
  formatWeight *
  engagementQualityWeight *
  accountFitWeight;

estimatedPayout =
  (effectiveVerifiedViews / 1000) * accountBaseRatePer1k;
```

Instead of showing one fake-precise dollar number, the extension now renders an approximate midpoint payout in the UI and keeps the low/mid/high range in the tooltip.

All calibration values live at the top of [`main.js`](./main.js), including `accountBaseRatePer1k`. That base rate is meant to be tuned from real payouts on a specific account, not treated as a universal constant.

Current defaults are intentionally conservative and should be treated as a public heuristic, not a source-of-truth payout calculator.
