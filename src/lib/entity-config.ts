export const ENTITY_LABELS = [
  "Artist",
  "Album",
  "Track",
  "Equipment",
  "Instrument",
  "Studio",
  "Person",
  "Credit",
  "Label",
  "Performance",
  "Effect",
  "Genre",
  "Playlist",
  "Venue",
  "SongWork",
  "Session",
  "Release",
] as const;

export type EntityLabel = (typeof ENTITY_LABELS)[number];

type EntityConfig = {
  displayName: string;
  displayPropertyKeys: string[];
  placeholder: string;
  descriptionNoun: string;
  emptyHint: string;
  example: string;
};

const ENTITY_CONFIG: Record<EntityLabel, EntityConfig> = {
  Artist: {
    displayName: "Artist",
    displayPropertyKeys: ["name"],
    placeholder: "e.g. The Who",
    descriptionNoun: "artist",
    emptyHint: "Search for an artist to load their connected neighborhood.",
    example: "The Who",
  },
  Album: {
    displayName: "Album",
    displayPropertyKeys: ["title", "name"],
    placeholder: "e.g. Who's Next",
    descriptionNoun: "album",
    emptyHint: "Search for an album to explore its artist, tracks, and related graph entities.",
    example: "Who's Next",
  },
  Track: {
    displayName: "Song",
    displayPropertyKeys: ["title", "name"],
    placeholder: "e.g. Baba O'Riley",
    descriptionNoun: "song",
    emptyHint: "Search for a song to reveal performers, albums, and surrounding relationships.",
    example: "Baba O'Riley",
  },
  Equipment: {
    displayName: "Equipment",
    displayPropertyKeys: ["name", "title"],
    placeholder: "e.g. Neve Console",
    descriptionNoun: "piece of equipment",
    emptyHint: "Search for equipment to see where and how it appears in the music graph.",
    example: "Neve Console",
  },
  Instrument: {
    displayName: "Instrument",
    displayPropertyKeys: ["name", "title"],
    placeholder: "e.g. Fender Telecaster",
    descriptionNoun: "instrument",
    emptyHint: "Search for an instrument to find artists, performances, and sessions around it.",
    example: "Fender Telecaster",
  },
  Studio: {
    displayName: "Studio",
    displayPropertyKeys: ["name", "title"],
    placeholder: "e.g. Olympic Studios",
    descriptionNoun: "studio",
    emptyHint: "Search for a studio to uncover recordings, people, and sessions linked to it.",
    example: "Olympic Studios",
  },
  Person: {
    displayName: "Person",
    displayPropertyKeys: ["name"],
    placeholder: "e.g. Pete Townshend",
    descriptionNoun: "person",
    emptyHint: "Search for a person to trace their credits, works, and collaborators.",
    example: "Pete Townshend",
  },
  Credit: {
    displayName: "Credit",
    displayPropertyKeys: ["name", "title", "role"],
    placeholder: "e.g. Producer",
    descriptionNoun: "credit",
    emptyHint: "Search for a credit to see where that role appears across the graph.",
    example: "Producer",
  },
  Label: {
    displayName: "Label",
    displayPropertyKeys: ["name"],
    placeholder: "e.g. Polydor",
    descriptionNoun: "label",
    emptyHint: "Search for a label to inspect releases, artists, and connected recordings.",
    example: "Polydor",
  },
  Performance: {
    displayName: "Performance",
    displayPropertyKeys: ["name", "title"],
    placeholder: "e.g. Live at Leeds",
    descriptionNoun: "performance",
    emptyHint: "Search for a performance to explore the people, venue, and works around it.",
    example: "Live at Leeds",
  },
  Effect: {
    displayName: "Effect",
    displayPropertyKeys: ["name", "title"],
    placeholder: "e.g. Distortion",
    descriptionNoun: "effect",
    emptyHint: "Search for an effect to discover where it appears in the recording graph.",
    example: "Distortion",
  },
  Genre: {
    displayName: "Genre",
    displayPropertyKeys: ["name", "title"],
    placeholder: "e.g. classic rock",
    descriptionNoun: "genre",
    emptyHint: "Search for a genre to reveal the artists and works it connects.",
    example: "classic rock",
  },
  Playlist: {
    displayName: "Playlist",
    displayPropertyKeys: ["name", "title"],
    placeholder: "e.g. Road Trip",
    descriptionNoun: "playlist",
    emptyHint: "Search for a playlist to inspect its tracks and surrounding context.",
    example: "Road Trip",
  },
  Venue: {
    displayName: "Venue",
    displayPropertyKeys: ["venue", "name", "title"],
    placeholder: "e.g. Madison Square Garden",
    descriptionNoun: "venue",
    emptyHint: "Search for a venue to see performances, artists, and sessions connected to it.",
    example: "Madison Square Garden",
  },
  SongWork: {
    displayName: "Song work",
    displayPropertyKeys: ["title", "name"],
    placeholder: "e.g. Pinball Wizard",
    descriptionNoun: "song work",
    emptyHint: "Search for a song work to see versions, writers, and performances linked to it.",
    example: "Pinball Wizard",
  },
  Session: {
    displayName: "Session",
    displayPropertyKeys: ["name", "title"],
    placeholder: "e.g. Quadrophenia Sessions",
    descriptionNoun: "session",
    emptyHint: "Search for a session to reveal recordings, people, and studios tied to it.",
    example: "Quadrophenia Sessions",
  },
  Release: {
    displayName: "Release",
    displayPropertyKeys: ["title", "name"],
    placeholder: "e.g. 30 Years of Maximum R&B",
    descriptionNoun: "release",
    emptyHint: "Search for a release to inspect labels, tracks, and connected entities.",
    example: "30 Years of Maximum R&B",
  },
};

const FALLBACK_CONFIG: EntityConfig = {
  displayName: "Entity",
  displayPropertyKeys: ["name", "title", "venue"],
  placeholder: "Search the graph",
  descriptionNoun: "entity",
  emptyHint: "Search the graph to uncover connected music relationships.",
  example: "The Who",
};

export function isEntityLabel(value: string): value is EntityLabel {
  return ENTITY_LABELS.includes(value as EntityLabel);
}

export function getEntityConfig(label: string): EntityConfig {
  if (isEntityLabel(label)) {
    return ENTITY_CONFIG[label];
  }
  return FALLBACK_CONFIG;
}

export function getEntityDisplayName(label: string): string {
  return getEntityConfig(label).displayName;
}

export function getEntityDisplayPropertyKeys(label: string): string[] {
  return getEntityConfig(label).displayPropertyKeys;
}

export function getEntitySearchPlaceholder(label: string): string {
  return getEntityConfig(label).placeholder;
}

export function getEntityDescriptionNoun(label: string): string {
  return getEntityConfig(label).descriptionNoun;
}

export function getEntityEmptyHint(label: string): string {
  return getEntityConfig(label).emptyHint;
}

export function getEntityExample(label: string): string {
  return getEntityConfig(label).example;
}

export function getNodeDisplayName(node: {
  id: string;
  labels: string[];
  properties: Record<string, unknown>;
}): string {
  const label = node.labels[0] ?? "";
  const propertyKeys = getEntityDisplayPropertyKeys(label);
  for (const key of propertyKeys) {
    const value = node.properties[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  for (const fallbackKey of ["name", "title", "venue"]) {
    const value = node.properties[fallbackKey];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return node.id;
}
