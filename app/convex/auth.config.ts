// Convex Auth configuration for the backend
// See https://labs.convex.dev/auth/config
export default {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL,
      applicationID: "convex",
    },
  ],
};
