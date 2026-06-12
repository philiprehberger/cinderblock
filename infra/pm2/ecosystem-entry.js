// PM2 ecosystem entry for Cinderblock. Merge this into
// /var/www/ecosystem.config.js on the EC2 host (don't replace the file —
// it manages every Next.js demo on the host).
//
// Port assignment: 3015 (verified free on EC2 2026-06-12; 3000-3014 all
// taken by sibling demos).

module.exports = {
  name: "cinderblock",
  cwd: "/var/www/cinderblock",
  script: "server.js",
  watch: false,
  max_memory_restart: "500M",
  env: {
    NODE_ENV: "production",
    PORT: 3015,
  },
};
