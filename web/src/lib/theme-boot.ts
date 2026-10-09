/** Shared by the server layout and the client theme store (no "use client"). */
export const THEME_KEY = "bimafy.theme";

/**
 * One-time move of saved data from the old "insurax." keys (session, offline
 * leads and outbox, theme, language) so the rename signs nobody out and loses
 * no unsynced lead. Collect keys first: removing while iterating shifts indexes.
 */
const MIGRATE_KEYS = `for(var k=[],i=0;i<localStorage.length;i++){var n=localStorage.key(i);if(n&&n.indexOf("insurax.")===0)k.push(n)}k.forEach(function(n){var m="bimafy."+n.slice(8);if(localStorage.getItem(m)===null)localStorage.setItem(m,localStorage.getItem(n));localStorage.removeItem(n)});`;

/**
 * Runs in <head> before first paint so a saved theme never flashes.
 * Kept tiny and dependency-free; it is inlined as a string.
 */
export const THEME_BOOT_SCRIPT = `try{${MIGRATE_KEYS}var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
