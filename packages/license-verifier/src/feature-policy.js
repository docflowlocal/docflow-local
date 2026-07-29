"use strict";

// SPDX-License-Identifier: MPL-2.0

/**
 * Central feature catalogue for local entitlement decisions.
 *
 * Feature identifiers are deliberately stable, serializable strings.  Keep
 * commercial claims explicit: a paid edition name alone never enables a paid
 * feature; the signed license must list it and the binary's build ceiling must
 * contain it.
 */
const EDITION_ORDER = Object.freeze(["community", "pro", "business"]);
const DEFAULT_BUILD_CEILING = "community";

const FEATURE_CATALOG = Object.freeze({
  "documents.import": Object.freeze({ minimumEdition: "community" }),
  "templates.mapping": Object.freeze({ minimumEdition: "community" }),
  "rules.edit": Object.freeze({ minimumEdition: "community" }),
  "documents.batchGenerate": Object.freeze({ minimumEdition: "community" }),
  "validation.preflight": Object.freeze({ minimumEdition: "community" }),
  "packages.delivery": Object.freeze({ minimumEdition: "community" }),
  "templates.library": Object.freeze({ minimumEdition: "community" }),
  "automation.cli": Object.freeze({ minimumEdition: "community" }),

  "pdf.visualDesigner": Object.freeze({ minimumEdition: "pro" }),
  "projects.history": Object.freeze({ minimumEdition: "pro" }),
  "data.relational": Object.freeze({ minimumEdition: "pro" }),
  "folders.watched": Object.freeze({ minimumEdition: "pro" }),
  "automation.scheduled": Object.freeze({ minimumEdition: "pro" }),
  "automation.apiTrigger": Object.freeze({ minimumEdition: "pro" }),
  "audit.reports": Object.freeze({ minimumEdition: "pro" }),
  "approvals.checkpoints": Object.freeze({ minimumEdition: "pro" }),
  "connectors.commercial": Object.freeze({ minimumEdition: "pro" }),
  "support.priority": Object.freeze({ minimumEdition: "pro" }),

  "templates.sharedLibrary": Object.freeze({ minimumEdition: "business" }),
  "deployment.controls": Object.freeze({ minimumEdition: "business" }),
  "licensing.business": Object.freeze({ minimumEdition: "business" })
});

const COMMUNITY_FEATURES = Object.freeze(
  Object.keys(FEATURE_CATALOG)
    .filter(feature => FEATURE_CATALOG[feature].minimumEdition === "community")
    .sort()
);

function editionRank(edition) {
  return EDITION_ORDER.indexOf(edition);
}

function isEdition(value) {
  return typeof value === "string" && editionRank(value) !== -1;
}

function isKnownFeature(value) {
  return typeof value === "string"
    && Object.prototype.hasOwnProperty.call(FEATURE_CATALOG, value);
}

function featuresAvailableAt(edition) {
  if (!isEdition(edition)) throw new TypeError(`Unknown edition: ${String(edition)}`);
  const rank = editionRank(edition);
  return Object.freeze(
    Object.keys(FEATURE_CATALOG)
      .filter(feature => editionRank(FEATURE_CATALOG[feature].minimumEdition) <= rank)
      .sort()
  );
}

/**
 * Validate a signed feature list against the catalogue and claimed edition.
 * This is exported so the license parser and future issuer tooling use the
 * exact same vocabulary.
 */
function validateLicensedFeatures(features, edition) {
  if (!isEdition(edition) || edition === "community") {
    return Object.freeze({ ok: false, code: "edition_invalid" });
  }
  if (!Array.isArray(features)) {
    return Object.freeze({ ok: false, code: "features_invalid" });
  }
  if (features.length > Object.keys(FEATURE_CATALOG).length) {
    return Object.freeze({ ok: false, code: "features_too_many" });
  }

  const seen = new Set();
  for (let index = 0; index < features.length; index += 1) {
    const feature = features[index];
    if (typeof feature !== "string" || feature.length < 1 || feature.length > 64) {
      return Object.freeze({ ok: false, code: "feature_invalid", index });
    }
    if (!isKnownFeature(feature)) {
      return Object.freeze({ ok: false, code: "feature_unknown", index, feature });
    }
    if (seen.has(feature)) {
      return Object.freeze({ ok: false, code: "feature_duplicate", index, feature });
    }
    if (editionRank(FEATURE_CATALOG[feature].minimumEdition) > editionRank(edition)) {
      return Object.freeze({ ok: false, code: "feature_not_in_edition", index, feature });
    }
    seen.add(feature);
  }
  return Object.freeze({ ok: true, code: null });
}

/**
 * Resolve the effective, serializable feature policy.
 *
 * `buildCeiling` is a compile/distribution boundary. A Business license cannot
 * turn a Pro build into a Business build, and the safe default is Community.
 * Community capabilities are always present; paid capabilities require both a
 * signed claim and availability in the build.
 */
function resolveFeaturePolicy({
  licensedEdition = "community",
  licensedFeatures = [],
  buildCeiling = DEFAULT_BUILD_CEILING,
  source = "community"
} = {}) {
  if (!isEdition(buildCeiling)) {
    throw new TypeError(`Unknown build ceiling: ${String(buildCeiling)}`);
  }
  if (!isEdition(licensedEdition)) {
    throw new TypeError(`Unknown licensed edition: ${String(licensedEdition)}`);
  }
  if (!Array.isArray(licensedFeatures)) {
    throw new TypeError("licensedFeatures must be an array");
  }

  if (licensedEdition !== "community") {
    const validation = validateLicensedFeatures(licensedFeatures, licensedEdition);
    if (!validation.ok) {
      throw new TypeError(`Invalid licensed feature list: ${validation.code}`);
    }
  } else if (licensedFeatures.length !== 0) {
    throw new TypeError("Community policy cannot contain licensed features");
  }

  const ceilingRank = editionRank(buildCeiling);
  const licensedRank = editionRank(licensedEdition);
  const effectiveEdition = EDITION_ORDER[Math.min(ceilingRank, licensedRank)];
  const enabled = new Set(COMMUNITY_FEATURES);

  for (const feature of licensedFeatures) {
    if (editionRank(FEATURE_CATALOG[feature].minimumEdition) <= ceilingRank) {
      enabled.add(feature);
    }
  }

  return Object.freeze({
    source: licensedEdition === "community" ? "community" : String(source || "license"),
    buildCeiling,
    licensedEdition,
    effectiveEdition,
    capped: licensedRank > ceilingRank,
    features: Object.freeze([...enabled].sort())
  });
}

function communityPolicy(buildCeiling = DEFAULT_BUILD_CEILING) {
  return resolveFeaturePolicy({ buildCeiling });
}

function hasFeature(policy, feature) {
  if (!policy || !Array.isArray(policy.features) || !isKnownFeature(feature)) return false;
  return policy.features.includes(feature);
}

module.exports = Object.freeze({
  EDITION_ORDER,
  DEFAULT_BUILD_CEILING,
  FEATURE_CATALOG,
  COMMUNITY_FEATURES,
  isEdition,
  isKnownFeature,
  featuresAvailableAt,
  validateLicensedFeatures,
  resolveFeaturePolicy,
  communityPolicy,
  hasFeature
});
