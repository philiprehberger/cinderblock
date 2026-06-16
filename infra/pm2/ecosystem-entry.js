// PM2 ecosystem entry for Cinderblock. Merge this into
// /var/www/ecosystem.config.js on the EC2 host (don't replace the file —
// it manages every Next.js demo on the host).
//
// Port assignment: 3015 (verified free on EC2 2026-06-12; 3000-3014 all
// taken by sibling demos).
//
// cwd points at the atomic-release `current/` symlink (not the
// release_root itself) so `pm2 reload cinderblock` picks up the new
// release after `shipyard deploy` flips the symlink. Same pattern as
// shipyard-web — see ~/projects/shipyard/shipyard.yaml's header
// comment.

module.exports = {
  name: "cinderblock",
  cwd: "/var/www/cinderblock/current",
  script: "server.js",
  watch: false,
  max_memory_restart: "500M",
  env: {
    NODE_ENV: "production",
    PORT: 3015,
  },
};
