// PM2 ecosystem entry for Cinderblock. Merge this into
// /var/www/ecosystem.config.js on the EC2 host (don't replace the file —
// it manages every Next.js demo on the host).
//
// Port assignment: 3010 per the .guides/new_demo_project.md table at the
// time of writing. Re-check before installing — 3011+ may also be free.

module.exports = {
  name: "cinderblock",
  cwd: "/var/www/cinderblock",
  script: "server.js",
  watch: false,
  max_memory_restart: "500M",
  env: {
    NODE_ENV: "production",
    PORT: 3010,
  },
};
