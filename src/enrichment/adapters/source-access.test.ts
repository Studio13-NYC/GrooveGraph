import assert from "node:assert/strict";
import test from "node:test";

import {
  canUseConcreteApi,
  getEffectiveSourceRoute,
  getMissingApiEnvVars,
  usesConcreteApiWithoutKey,
} from "./source-access.js";

test("keyless API sources always stay concrete", () => {
  assert.equal(usesConcreteApiWithoutKey("musicbrainz"), true);
  assert.equal(usesConcreteApiWithoutKey("wikipedia"), true);
  assert.equal(usesConcreteApiWithoutKey("wikidata"), true);
  assert.equal(usesConcreteApiWithoutKey("secondhandsongs"), true);
  assert.deepEqual(getMissingApiEnvVars("secondhandsongs"), []);
  assert.equal(canUseConcreteApi({ adapterId: "musicbrainz" }), true);
  assert.equal(canUseConcreteApi({ adapterId: "secondhandsongs" }), true);
  assert.equal(getEffectiveSourceRoute({ adapterId: "musicbrainz" }), "api");
  assert.equal(getEffectiveSourceRoute({ adapterId: "secondhandsongs" }), "api");
});

test("keyed API sources require all configured credentials before taking the API path", () => {
  const previousSpotifyClientId = process.env.SPOTIFY_CLIENT_ID;
  const previousSpotifyClientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  process.env.SPOTIFY_CLIENT_ID = "spotify-client-id";
  delete process.env.SPOTIFY_CLIENT_SECRET;
  assert.deepEqual(getMissingApiEnvVars("spotify"), ["SPOTIFY_CLIENT_SECRET"]);
  assert.equal(canUseConcreteApi({ adapterId: "spotify" }), false);
  assert.equal(getEffectiveSourceRoute({ adapterId: "spotify" }), "firecrawl");

  process.env.SPOTIFY_CLIENT_SECRET = "spotify-client-secret";
  assert.deepEqual(getMissingApiEnvVars("spotify"), []);
  assert.equal(canUseConcreteApi({ adapterId: "spotify" }), true);
  assert.equal(getEffectiveSourceRoute({ adapterId: "spotify" }), "api");

  if (previousSpotifyClientId === undefined) {
    delete process.env.SPOTIFY_CLIENT_ID;
  } else {
    process.env.SPOTIFY_CLIENT_ID = previousSpotifyClientId;
  }

  if (previousSpotifyClientSecret === undefined) {
    delete process.env.SPOTIFY_CLIENT_SECRET;
  } else {
    process.env.SPOTIFY_CLIENT_SECRET = previousSpotifyClientSecret;
  }
});
