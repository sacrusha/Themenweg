/** The site is a demo or a preview, not the publisher's (vite.config.ts). */
declare const __THEMENWEG_DEMO__: boolean;
declare module "virtual:trail" {
  const trail: import("./trail-types.ts").Trail;
  export default trail;
}
