import path from "node:path";

/** Tudo que a wishlist guarda fica em <raiz do projeto>/data. */
export const DATA_DIR = path.join(/* turbopackIgnore: true */ process.cwd(), "data");
export const IMAGES_DIR = path.join(DATA_DIR, "images");
export const DEBUG_DIR = path.join(DATA_DIR, "debug");
