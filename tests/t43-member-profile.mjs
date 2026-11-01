#!/usr/bin/env node
// Forwarder: the suite lives beside the package it tests (declared path
// packages/dsh-agent-teams/tests/t43-member-profile.mjs). This entry keeps the
// documented verify command `node tests/t43-member-profile.mjs` working.
import '../packages/dsh-agent-teams/tests/t43-member-profile.mjs';
