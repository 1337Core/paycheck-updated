function convertToRawCount(internationalInputString) {
  const numberPattern = /([\d,.]+)([kmb]*)/i;
  const matches = internationalInputString.match(numberPattern);

  if (!matches) {
    return NaN; // Return NaN if the input doesn't match the expected pattern
  }

  const numericPart = matches[1];
  const multiplier = matches[2].toLowerCase();

  let numericValue;

  const lastChars = [
    numericPart.slice(-1),
    numericPart.slice(-2, -1),
    numericPart.slice(-3, -2),
  ];

  // Check if second or third to last character are , or . to handle international numbers
  if (lastChars.includes(".") || lastChars.includes(",")) {
    const parts = numericPart.replace(",", ".").split(".");
    const integerPart = parts[0].replace(/[,]/g, "");
    const decimalPart = parts[1] ? parts[1] : "0";
    numericValue = parseFloat(integerPart + "." + decimalPart);
  } else {
    numericValue = parseFloat(numericPart.replaceAll(",", ""));
  }

  let factor = 1;

  switch (multiplier) {
    case "k":
      factor = 1000;
      break;
    case "m":
      factor = 1000000;
      break;
    case "b":
      factor = 1000000000;
      break;
  }

  return Math.round(numericValue * factor);
}

const payoutConfig = Object.freeze({
  homeTimelineShare: 0.06,
  premiumViewerWeight: 1,
  engagementQualityWeight: 1,
  accountFitWeight: 1,
  postFormatWeight: 1,
  articleFormatWeight: 1.15,
  accountBaseRatePer1k: 0.5,
  rangeLowMultiplier: 0.6,
  rangeHighMultiplier: 1.5,
});

function estimateEffectiveVerifiedViews({
  totalViews,
  homeTimelineShare = payoutConfig.homeTimelineShare,
  premiumViewerWeight = payoutConfig.premiumViewerWeight,
  formatWeight = payoutConfig.postFormatWeight,
  engagementQualityWeight = payoutConfig.engagementQualityWeight,
  accountFitWeight = payoutConfig.accountFitWeight,
}) {
  if (!Number.isFinite(totalViews)) return NaN;

  return (
    totalViews *
    homeTimelineShare *
    premiumViewerWeight *
    formatWeight *
    engagementQualityWeight *
    accountFitWeight
  );
}

function estimatePayout({
  accountBaseRatePer1k = payoutConfig.accountBaseRatePer1k,
  ...effectiveViewArgs
}) {
  const effectiveVerifiedViews = estimateEffectiveVerifiedViews(
    effectiveViewArgs,
  );
  if (!Number.isFinite(effectiveVerifiedViews)) return NaN;

  return (effectiveVerifiedViews / 1000) * accountBaseRatePer1k;
}

function estimatePayoutRange({
  rangeLowMultiplier = payoutConfig.rangeLowMultiplier,
  rangeHighMultiplier = payoutConfig.rangeHighMultiplier,
  ...estimateArgs
}) {
  const mid = estimatePayout(estimateArgs);
  const effectiveVerifiedViews = estimateEffectiveVerifiedViews(estimateArgs);

  if (!Number.isFinite(mid) || !Number.isFinite(effectiveVerifiedViews)) {
    return {
      low: 0,
      mid: 0,
      high: 0,
      effectiveVerifiedViews: 0,
    };
  }

  return {
    low: mid * rangeLowMultiplier,
    mid,
    high: mid * rangeHighMultiplier,
    effectiveVerifiedViews,
  };
}

function formatCurrencyFull(amount) {
  if (!Number.isFinite(amount)) return "$0.000";
  return `$${amount.toFixed(3)}`;
}

function formatCurrencyCompact(amount) {
  if (!Number.isFinite(amount)) return "0.000";
  if (amount < 1000) return amount.toFixed(3);

  const units = [
    { value: 1000000000, suffix: "b" },
    { value: 1000000, suffix: "m" },
    { value: 1000, suffix: "k" },
  ];

  for (const unit of units) {
    if (amount >= unit.value) {
      return `${(amount / unit.value).toFixed(1)}${unit.suffix}`;
    }
  }

  return amount.toFixed(3);
}

function formatEffectiveVerifiedViews(effectiveVerifiedViews) {
  if (!Number.isFinite(effectiveVerifiedViews)) return "0";
  return effectiveVerifiedViews.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
}

function buildPayoutDisplay(number, options = {}) {
  const totalViews = convertToRawCount(number);
  const range = estimatePayoutRange({
    totalViews,
    ...options,
  });
  const mid = formatCurrencyCompact(range.mid);

  return {
    text: `~$${mid}`,
    textAfterIcon: `~${mid}`,
    title: [
      `Low: ${formatCurrencyFull(range.low)}`,
      `Mid: ${formatCurrencyFull(range.mid)}`,
      `High: ${formatCurrencyFull(range.high)}`,
      `Effective verified views: ${formatEffectiveVerifiedViews(range.effectiveVerifiedViews)}`,
    ].join("\n"),
  };
}

function rewriteArticleMetric(node, sourceValue, replacementText) {
  if (!node) return;

  const textNodes = [];
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);

  while (walker.nextNode()) {
    textNodes.push(walker.currentNode);
  }

  const normalizedSourceValue = sourceValue?.trim();
  let amountReplaced = false;

  for (const textNode of textNodes) {
    const currentValue = textNode.nodeValue ?? "";
    const trimmedValue = currentValue.trim();

    if (
      !amountReplaced &&
      normalizedSourceValue &&
      trimmedValue.includes(normalizedSourceValue)
    ) {
      textNode.nodeValue = currentValue.replace(
        normalizedSourceValue,
        replacementText,
      );
      amountReplaced = true;
      continue;
    }

    if (/^views?$/i.test(trimmedValue)) {
      textNode.nodeValue = "";
    }
  }

  if (!amountReplaced) {
    const textContainer = node.querySelector("span") ?? node;
    textContainer.textContent = replacementText;
  }
}

const globalSelectors = {};
globalSelectors.postCounts = `[role="group"][id*="id__"]:only-child`;
globalSelectors.articleDate = `[role="article"][aria-labelledby*="id__"][tabindex="-1"] time`;
globalSelectors.analyticsLink = " :not(.dollarBox)>a[href*='/analytics']";
globalSelectors.viewCount =
  globalSelectors.postCounts + globalSelectors.analyticsLink;

const innerSelectors = {};
innerSelectors.dollarSpot = "div div:first-child";
innerSelectors.viewSVG = "div div:first-child svg";
innerSelectors.viewAmount = "div div:last-child span span span";
innerSelectors.articleViewAmount = "span div:first-child span span span";

function doWork() {
  const viewCounts = Array.from(
    document.querySelectorAll(globalSelectors.viewCount),
  );

  const articleViewDateSections = document.querySelectorAll(
    globalSelectors.articleDate,
  );

  if (articleViewDateSections.length) {
    const articleRoots = Array.from(articleViewDateSections, (articleDate) =>
      articleDate?.parentElement?.parentElement?.parentElement,
    ).filter(Boolean);

    for (const rootDateViewsSection of new Set(articleRoots)) {
      // if there is one child, that means it's an old tweet with no viewcount
      if (rootDateViewsSection.children?.length === 1) continue;
      if (rootDateViewsSection.children?.length < 3) continue;
      const articleViewMetric = rootDateViewsSection.children[2];
      const originalViewCountValue = articleViewMetric?.querySelector(
        innerSelectors.articleViewAmount,
      )?.textContent;

      if (!originalViewCountValue) continue;
      if (!/views?/i.test(articleViewMetric.textContent ?? "")) continue;

      // normalize the footer before inserting our estimate so repeated
      // MutationObserver runs cannot accumulate duplicate nodes.
      while (rootDateViewsSection.children.length > 3) {
        rootDateViewsSection.lastElementChild?.remove();
      }

      // clone 2nd and 3rd child of rootDateViewsSection
      const clonedDateViewSeparator =
        rootDateViewsSection.children[1].cloneNode(true);
      const clonedDateView = rootDateViewsSection.children[2].cloneNode(true);

      // insert the estimate pair directly after the native view count pair
      rootDateViewsSection.insertBefore(
        clonedDateViewSeparator,
        rootDateViewsSection.children[2].nextSibling,
      );
      rootDateViewsSection.insertBefore(
        clonedDateView,
        clonedDateViewSeparator.nextSibling,
      );

      const payoutDisplay = buildPayoutDisplay(originalViewCountValue, {
        formatWeight: payoutConfig.articleFormatWeight,
      });

      rewriteArticleMetric(
        clonedDateView,
        originalViewCountValue,
        payoutDisplay.text,
      );
      clonedDateView.title = payoutDisplay.title;
    }
  }

  for (const view of viewCounts) {
    // only add the dollar box once
    if (!view.classList.contains("replaced")) {
      // make sure we don't touch this one again
      view.classList.add("replaced");

      // get parent and clone to make dollarBox
      const parent = view.parentElement;
      const dollarBox = parent.cloneNode(true);
      dollarBox.classList.add("dollarBox");

      // insert dollarBox after view count
      parent.parentElement.insertBefore(dollarBox, parent.nextSibling);

      // remove view count icon
      const oldIcon = dollarBox.querySelector(innerSelectors.viewSVG);
      oldIcon?.remove();

      // swap the svg for a dollar sign
      const dollarSpot = dollarBox.querySelector(innerSelectors.dollarSpot)
        ?.firstChild?.firstChild;
      dollarSpot.textContent = "$";

      // magic alignment value
      dollarSpot.style.marginTop = "-0.6rem";
    }

    // get the number of views and calculate & set the dollar amount
    const dollarBox = view.parentElement.nextSibling.firstChild;
    const viewCount = view.querySelector(
      innerSelectors.viewAmount,
    )?.textContent;
    if (viewCount == undefined) continue;
    const dollarAmountArea = dollarBox.querySelector(innerSelectors.viewAmount);
    const payoutDisplay = buildPayoutDisplay(viewCount, {
      formatWeight: payoutConfig.postFormatWeight,
    });
    dollarAmountArea.textContent = payoutDisplay.textAfterIcon;
    dollarAmountArea.title = payoutDisplay.title;
    dollarBox.title = payoutDisplay.title;
  }
}

function throttle(func, limit) {
  let lastFunc;
  let lastRan;
  return function () {
    const context = this;
    const args = arguments;
    if (!lastRan) {
      func.apply(context, args);
      lastRan = Date.now();
    } else {
      clearTimeout(lastFunc);
      lastFunc = setTimeout(
        function () {
          if (Date.now() - lastRan >= limit) {
            func.apply(context, args);
            lastRan = Date.now();
          }
        },
        limit - (Date.now() - lastRan),
      );
    }
  };
}

// Function to start MutationObserver
const observe = () => {
  const runDocumentMutations = throttle(() => {
    requestAnimationFrame(doWork);
  }, 1000);

  const observer = new MutationObserver((mutationsList) => {
    if (!mutationsList.length) return;
    runDocumentMutations();
  });

  observer.observe(document, {
    childList: true,
    subtree: true,
  });
};

observe();
