import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(scriptDirectory, '..')

const files = {
  agents: 'AGENTS.md',
  roadmap: 'docs/migration/godot-program-roadmap.json',
  state: 'docs/migration/godot-program-state.json',
  roadmapDocument: 'docs/migration/godot-program-roadmap.md',
  decisions: 'docs/migration/decisions/README.md',
  reports: 'docs/migration/mission-reports/README.md',
}

function readText(relativePath) {
  return readFileSync(resolve(repositoryRoot, relativePath), 'utf8')
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath))
}

function invariant(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function missionMap(roadmap) {
  return new Map(roadmap.missions.map((mission) => [mission.id, mission]))
}

function normalizedSha256(text) {
  return createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex')
}

function validateProgram(roadmap, state, options = {}) {
  const checkFiles = options.checkFiles ?? true
  const checkGit = options.checkGit ?? true
  const missions = missionMap(roadmap)
  const completedIds = state.completedMissions.map((mission) => mission.id)
  const completedSet = new Set(completedIds)
  const blockedIds = state.blockedMissions.map((mission) => mission.id)
  const blockedSet = new Set(blockedIds)

  invariant(roadmap.schemaVersion === 1, 'roadmap schemaVersion must be 1')
  invariant(state.schemaVersion === 1, 'state schemaVersion must be 1')
  invariant(roadmap.programId === 'godot-full-migration', 'unexpected roadmap programId')
  invariant(state.programId === roadmap.programId, 'state programId must match roadmap')
  invariant(state.charterPath === roadmap.charterPath, 'state charter must match roadmap charter')
  invariant(Number.isInteger(roadmap.charterRevision) && roadmap.charterRevision > 0, 'invalid roadmap charter revision')
  invariant(state.charterRevision === roadmap.charterRevision, 'unapproved charter revision')
  invariant(state.charterSha256 === roadmap.charterSha256, 'state charter digest must match roadmap')
  invariant(state.roadmapPath === files.roadmap, 'state roadmapPath must name the canonical roadmap')
  invariant(['active', 'blocked', 'complete'].includes(state.status), 'invalid program status')
  invariant(['brief_pending', 'implementation_pending', 'executing', 'verifying', 'checkpointing', 'blocked', 'complete'].includes(state.phase), 'invalid program phase')
  invariant(missions.size === roadmap.missions.length, 'duplicate mission id in roadmap')
  invariant(new Set(completedIds).size === completedIds.length, 'duplicate completed mission id')
  invariant(new Set(blockedIds).size === blockedIds.length, 'duplicate blocked mission id')

  for (const [missionIndex, mission] of roadmap.missions.entries()) {
    invariant(/^MB\d{2}$/.test(mission.id), `invalid mission id ${mission.id}`)
    invariant(Array.isArray(mission.dependsOn), `${mission.id} dependsOn must be an array`)
    for (const dependency of mission.dependsOn) {
      invariant(missions.has(dependency), `${mission.id} has unknown dependency ${dependency}`)
      invariant(dependency !== mission.id, `${mission.id} cannot depend on itself`)
      invariant(roadmap.missions.findIndex((candidate) => candidate.id === dependency) < missionIndex, `${mission.id} dependency ${dependency} must appear earlier in the roadmap`)
    }
  }

  for (const completed of state.completedMissions) {
    invariant(missions.has(completed.id), `completed mission ${completed.id} is absent from roadmap`)
    invariant(!blockedSet.has(completed.id), `${completed.id} cannot be both completed and blocked`)
    invariant(/^[0-9a-f]{7,40}$/i.test(completed.commit), `${completed.id} has invalid commit id`)
    if (checkFiles) {
      readText(completed.briefPath)
      readText(completed.reportPath)
    }
  }

  for (const blocked of state.blockedMissions) {
    invariant(missions.has(blocked.id), `blocked mission ${blocked.id} is absent from roadmap`)
    invariant(typeof blocked.reason === 'string' && blocked.reason.length > 0, `${blocked.id} needs a blocker reason`)
  }

  if (state.status === 'complete') {
    invariant(state.phase === 'complete', 'complete program must have complete phase')
    invariant(state.currentMissionId === null, 'complete program cannot have a current mission')
    invariant(state.currentBriefPath === null, 'complete program cannot have a current brief')
    invariant(state.readyMissionIds.length === 0, 'complete program cannot have ready missions')
    invariant(completedSet.has(roadmap.missionRange.last), 'complete program must include the final mission')
  } else if (state.status === 'blocked') {
    invariant(state.phase === 'blocked', 'blocked program must have blocked phase')
    invariant(state.currentMissionId === null, 'blocked program cannot claim an executable current mission')
    invariant(state.currentBriefPath === null, 'blocked program cannot have a current brief')
    invariant(state.readyMissionIds.length === 0, 'blocked program cannot claim ready missions')
    invariant(state.blockedMissions.length > 0, 'blocked program needs at least one recorded blocker')
  } else {
    invariant(missions.has(state.currentMissionId), 'active program needs a known current mission')
    invariant(!completedSet.has(state.currentMissionId), 'current mission is already completed')
    invariant(!blockedSet.has(state.currentMissionId), 'current mission is blocked')
    const currentMission = missions.get(state.currentMissionId)
    for (const dependency of currentMission.dependsOn) {
      invariant(completedSet.has(dependency), `${state.currentMissionId} dependency ${dependency} is incomplete`)
    }
    if (state.phase === 'brief_pending') {
      invariant(state.currentBriefPath === null, 'brief_pending phase must not claim a brief path')
    } else {
      invariant(typeof state.currentBriefPath === 'string', `${state.phase} phase requires a current brief path`)
      if (checkFiles) {
        readText(state.currentBriefPath)
      }
    }
  }

  invariant(Array.isArray(state.readyMissionIds), 'readyMissionIds must be an array')
  for (const readyId of state.readyMissionIds) {
    invariant(missions.has(readyId), `ready mission ${readyId} is absent from roadmap`)
    invariant(!completedSet.has(readyId), `ready mission ${readyId} is already complete`)
    invariant(!blockedSet.has(readyId), `ready mission ${readyId} is blocked`)
    for (const dependency of missions.get(readyId).dependsOn) {
      invariant(completedSet.has(dependency), `ready mission ${readyId} dependency ${dependency} is incomplete`)
    }
  }
  if (state.status === 'active') {
    invariant(state.readyMissionIds.length > 0, 'active program needs at least one ready mission')
    invariant(state.readyMissionIds.includes(state.currentMissionId), 'current mission must be in readyMissionIds')
  }
  invariant(state.lastCheckpoint.missionId === state.completedMissions.at(-1)?.id, 'last checkpoint must match the latest completed mission')
  invariant(state.lastCheckpoint.commit === state.completedMissions.at(-1)?.commit, 'last checkpoint commit mismatch')

  if (checkFiles) {
    const charter = readText(state.charterPath)
    invariant(charter.startsWith('# Mission Brief:'), 'charter must be a Mission Brief')
    invariant(charter.includes('## Outcome'), 'charter is missing Outcome')
    invariant(charter.includes('## Evidence of Completion'), 'charter is missing completion evidence')
    invariant(charter.includes('不得由执行者自行放宽'), 'charter must protect fixed clauses from silent weakening')
    invariant(normalizedSha256(charter) === state.charterSha256, 'charter content digest mismatch; an authorized change must update roadmap and state evidence')
    invariant(readText(files.agents).includes('## Godot full-migration program'), 'AGENTS.md is missing migration bootstrap instructions')
    readText(files.roadmapDocument)
    readText(files.decisions)
    readText(files.reports)
  }

  if (checkGit) {
    const branch = execFileSync('git', ['branch', '--show-current'], { cwd: repositoryRoot, encoding: 'utf8' }).trim()
    invariant(branch === state.branch, `ledger branch ${state.branch} does not match current branch ${branch}`)
    for (const completed of state.completedMissions) {
      execFileSync('git', ['cat-file', '-e', `${completed.commit}^{commit}`], { cwd: repositoryRoot, stdio: 'ignore' })
    }
  }
}

function expectFailure(name, mutate, roadmap, state) {
  const changedRoadmap = structuredClone(roadmap)
  const changedState = structuredClone(state)
  mutate(changedRoadmap, changedState)
  try {
    validateProgram(changedRoadmap, changedState, { checkFiles: false, checkGit: false })
  } catch {
    return
  }
  throw new Error(`self-test did not reject ${name}`)
}

function runSelfTests(roadmap, state) {
  expectFailure('duplicate completion', (_roadmap, changed) => {
    changed.completedMissions.push(structuredClone(changed.completedMissions[0]))
  }, roadmap, state)
  expectFailure('unmet dependency', (_roadmap, changed) => {
    changed.currentMissionId = 'MB04'
    changed.readyMissionIds = ['MB04']
  }, roadmap, state)
  expectFailure('missing active brief', (_roadmap, changed) => {
    changed.phase = 'executing'
    changed.currentBriefPath = null
  }, roadmap, state)
  expectFailure('unapproved charter revision', (_roadmap, changed) => {
    changed.charterRevision = 2
  }, roadmap, state)
}

function recoverySnapshot(roadmap, state) {
  const missions = missionMap(roadmap)
  const current = missions.get(state.currentMissionId)
  return {
    programId: state.programId,
    status: state.status,
    phase: state.phase,
    branch: state.branch,
    charter: state.charterPath,
    currentMission: current ? { id: current.id, title: current.title } : null,
    currentBrief: state.currentBriefPath,
    completedMissions: state.completedMissions.map((mission) => mission.id),
    blockedMissions: state.blockedMissions.map((mission) => mission.id),
    nextAction: state.nextAction,
    bootstrapReadOrder: [
      files.agents,
      state.charterPath,
      files.roadmap,
      files.state,
      state.currentBriefPath,
      state.completedMissions.at(-1)?.reportPath,
      'references/parity-matrix.md',
      'git status --short and git log',
    ].filter(Boolean),
  }
}

const roadmap = readJson(files.roadmap)
const state = readJson(files.state)
validateProgram(roadmap, state)

if (process.argv.includes('--self-test')) {
  runSelfTests(roadmap, state)
  console.log('[Godot program check] mutation self-tests passed: 4')
}

if (process.argv.includes('--recover')) {
  console.log(JSON.stringify(recoverySnapshot(roadmap, state), null, 2))
} else {
  console.log(`[Godot program check] valid: ${state.programId} ${state.currentMissionId} ${state.phase}`)
}
