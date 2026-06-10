// Enforces Conventional Commits, e.g.:
//   feat: add group invitations
//   fix(events): correct all-day end date
//   chore: bump dependencies
module.exports = {
  extends: ["@commitlint/config-conventional"],
};
