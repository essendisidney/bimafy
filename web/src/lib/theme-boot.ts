/** Shared by the server layout and the client theme store (no "use client"). */
export const THEME_KEY = "insurax.theme";

/**
 * Runs in <head> before first paint so a saved theme never flashes.
 * Kept tiny and dependency-free; it is inlined as a string.
 */
export const THEME_BOOT_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
