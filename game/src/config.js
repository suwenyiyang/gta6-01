// SOLMAR's shared tuning, palette and names. Values are deliberately arcade-like.

export const WORLD = Object.freeze({
  width: 5200,
  height: 3800,
  beachY: 3100,
  seaY: 3380,
  cityTop: 40,
  cityRight: 5200,
});

export const ROAD = Object.freeze({
  verticalWidth: 112,
  horizontalWidth: 104,
  sidewalk: 20,
  laneOffset: 24,
  xs: Object.freeze([260, 900, 1540, 2180, 2820, 3460, 4100, 4740]),
  ys: Object.freeze([230, 750, 1270, 1790, 2310, 2830]),
});

export const COLORS = Object.freeze({
  seaDeep: '#168b9a',
  sea: '#24b8bd',
  seaLight: '#63d8cf',
  foam: '#e9fbf2',
  sand: '#e6c985',
  sandLight: '#f1db9e',
  sandShadow: '#c7a65f',
  promenade: '#d9c49a',
  asphalt: '#5a5651',
  asphaltDark: '#4b4845',
  asphaltLight: '#68615a',
  sidewalk: '#c8b9a2',
  sidewalkEdge: '#998c79',
  lane: '#e7d39a',
  laneWhite: '#f2ead7',
  grass: '#6e9b58',
  grassDark: '#557b45',
  parkPath: '#d6c29c',
  shadow: 'rgba(54, 37, 27, 0.24)',
  warmLight: 'rgba(255, 183, 92, 0.10)',
  night: 'rgba(18, 32, 47, 0.08)',
  ink: '#17202a',
  cream: '#fff0cf',
  coral: '#ef765f',
  turquoise: '#2eb7b2',
  gold: '#f6bd58',
  policeRed: '#e34d4d',
  policeBlue: '#3b78d8',
  building: Object.freeze([
    '#d98972', '#e6aa79', '#c97868', '#e8c58e', '#b9c9a8',
    '#86b9af', '#d8b7a2', '#c7a6b4', '#e3d1b0', '#ad8d75',
    '#82a9a2', '#d8947e',
  ]),
  roofs: Object.freeze([
    '#a96254', '#bd7b58', '#98594e', '#bb9a66', '#8aa078',
    '#5e918a', '#a47d6d', '#927281', '#b9a47f', '#81685a',
  ]),
  cars: Object.freeze([
    '#e8e0ce', '#c75d4d', '#3d7884', '#e3a53b', '#727d87',
    '#8ea36d', '#b87855', '#5d668e', '#d8a5a0', '#e8e0ce',
  ]),
});

export const TUNING = Object.freeze({
  fixedStep: 1 / 60,
  maxFrameDelta: 0.12,
  playerWalkSpeed: 150,
  playerRunSpeed: 238,
  playerRadius: 11,
  carRadius: 27,
  interactDistance: 92,
  missionRadius: 200,
  cameraLerp: 7.5,
  trafficCount: 54,
  pedestrianCount: 46,
  maxWanted: 5,
  policeSpawnInterval: 7.5,
  saveInterval: 10,
  bulletSpeed: 940,
  bulletLife: 0.58,
  maxHealth: 100,
});

export const CAR_TYPES = Object.freeze({
  sedan: Object.freeze({ length: 70, width: 34, maxSpeed: 274, reverseSpeed: 92, accel: 236, brake: 430, turnRate: 2.55, mass: 1.0, label: 'Sedan' }),
  taxi: Object.freeze({ length: 72, width: 35, maxSpeed: 265, reverseSpeed: 88, accel: 226, brake: 410, turnRate: 2.46, mass: 1.05, label: 'Taxi' }),
  sports: Object.freeze({ length: 74, width: 35, maxSpeed: 405, reverseSpeed: 110, accel: 355, brake: 520, turnRate: 3.08, mass: 0.9, label: 'Coupe' }),
  truck: Object.freeze({ length: 108, width: 46, maxSpeed: 192, reverseSpeed: 72, accel: 135, brake: 310, turnRate: 1.72, mass: 1.8, label: 'Box Truck' }),
  police: Object.freeze({ length: 78, width: 37, maxSpeed: 358, reverseSpeed: 100, accel: 310, brake: 480, turnRate: 2.92, mass: 1.15, label: 'Cruiser' }),
});

export const KEY_BINDINGS = Object.freeze({
  forward: Object.freeze(['KeyW', 'ArrowUp']),
  backward: Object.freeze(['KeyS', 'ArrowDown']),
  left: Object.freeze(['KeyA', 'ArrowLeft']),
  right: Object.freeze(['KeyD', 'ArrowRight']),
  run: Object.freeze(['ShiftLeft', 'ShiftRight']),
  interact: Object.freeze(['KeyE']),
  handbrake: Object.freeze(['Space']),
  punch: Object.freeze(['KeyF']),
  reload: Object.freeze(['KeyR']),
  pause: Object.freeze(['Escape']),
  mute: Object.freeze(['KeyM']),
  confirm: Object.freeze(['Enter']),
  continueGame: Object.freeze(['KeyC']),
});

export const GAME_STATE = Object.freeze({
  TITLE: 'TITLE',
  PLAY: 'PLAY',
  PAUSE: 'PAUSE',
  GAMEOVER: 'GAMEOVER',
});

export const MISSIONS = Object.freeze([
  Object.freeze({ title: 'Salt Air', objective: 'Meet Nessa at the marina steps', requiresCar: false, reward: 350, spot: 0, brief: 'Venn is calling in the last favour Mara owes the Breakwater crew. Nessa waits at the marina steps with the tide chart for a boat that never docks. Walk in quiet — the harbour patrol is watching.', complete: 'Nessa trusts you now. The tide is turning your way.' }),
  Object.freeze({ title: 'Hot Cargo', objective: 'Deliver the coupe to the arcade lot', requiresCar: true, reward: 650, spot: 1, brief: 'The crew lifted a gold coupe off the north strip, and its papers point straight back at them. Drive it to the arcade lot before the owners report it missing. One clean run, no scratches, no questions.', complete: 'The coupe is parked clean. Venn\u2019s crew owes you one.' }),
  Object.freeze({ title: 'Bad Radio', objective: 'Reach the radio tower and shake the tail', requiresCar: true, reward: 900, spot: 2, brief: 'A pirate station on the old radio tower is broadcasting the crew\u2019s getaway routes. Reach the tower, cut the signal, and shake the patrol cars rolling your way. If it stays live, every job after this burns.', complete: 'The tower is silent. The tail never saw your face.' }),
  Object.freeze({ title: 'Clean Tide', objective: 'Bring the payment to the north pier', requiresCar: true, reward: 1300, spot: 3, brief: 'The last Breakwater payment sits in a duffel at the north pier, and Venn\u2019s buyers want it moved before dawn. Carry it yourself: one quiet drive, no crew, no backup. Deliver it clean and the debt is settled.', complete: 'Payment delivered. Mara Quinn owes nobody in Solmar.' }),
]);

export const STORY_INTRO = 'Mara Quinn drove getaway cars for the Breakwater crew until one job went sideways and the debt landed on her. Now the fixer Silas Venn owns her next four nights — four jobs, one way out. Drive clean, keep the heat low, and take back the tide.';

export const CRIMINAL = Object.freeze({
  pedColors: Object.freeze(['#dd7a69', '#f2d6a2', '#3a8f8d', '#e0a942', '#4b6ca0', '#9c6d88', '#d2c7a9', '#7e9680']),
  skinColors: Object.freeze(['#f0c7a4', '#c98e65', '#8d5e45', '#e3b28b', '#6e4735']),
  hairColors: Object.freeze(['#2b221f', '#50372e', '#b98a4f', '#1e1d22', '#d8d1bd']),
});

export const SAVE_KEY = 'solmar-save-v1';
