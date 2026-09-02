const KNOWLEDGE_DOMAIN_ORDER = [
  "cn-math:domain:number-algebra",
  "cn-math:domain:geometry",
  "cn-math:domain:statistics-probability",
  "cn-math:domain:integrated-application",
];

export function capabilityCloudHash(value) {
  let result = 2166136261;
  for (let index = 0; index < String(value).length; index += 1) result = Math.imul(result ^ String(value).charCodeAt(index), 16777619);
  return result >>> 0;
}

function domainIndex(node, dimension) {
  if (dimension === "skill") return Math.max(0, ["skill:calculation", "skill:concept", "skill:reasoning", "skill:expression", "skill:modeling"].indexOf(node.key));
  const index = KNOWLEDGE_DOMAIN_ORDER.indexOf(node.domainKey);
  return index < 0 ? KNOWLEDGE_DOMAIN_ORDER.length - 1 : index;
}

export function capabilityGraphPoint(node, index, nodes, input = {}) {
  const dimension = input.dimension === "skill" ? "skill" : "knowledge";
  const count = dimension === "skill" ? 5 : KNOWLEDGE_DOMAIN_ORDER.length;
  const cluster = domainIndex(node, dimension);
  const xBase = count <= 1 ? 0 : (cluster / (count - 1) - .5) * 2.35;
  const peers = nodes.filter((item) => domainIndex(item, dimension) === cluster && Number(item.stage) === Number(node.stage));
  const peerIndex = Math.max(0, peers.findIndex((item) => item.key === node.key));
  const peerOffset = peers.length <= 1 ? 0 : (peerIndex / (peers.length - 1) - .5) * .68;
  const jitter = ((capabilityCloudHash(node.key) % 1000) / 1000 - .5) * .14;
  const stage = Number(node.stage) || (dimension === "skill" ? 1 : 7);
  const y = dimension === "skill" ? (stage - 2) * .82 : (stage - 8) * .92;
  const z = ((capabilityCloudHash(`${node.key}:depth`) % 1000) / 1000 - .5) * .72 + (Number(index) % 2 ? .05 : -.05);
  return { x: xBase + peerOffset + jitter, y, z };
}

export function projectCapabilityGraphPoint(point, input = {}) {
  const rotationY = Number(input.rotationY) || 0;
  const rotationX = Number.isFinite(Number(input.rotationX))
    ? Number(input.rotationX)
    : Number.isFinite(Number(input.tilt)) ? Number(input.tilt) : .2;
  const scaleX = Math.max(0, Number(input.scaleX) || 0);
  const scaleY = Math.max(0, Number(input.scaleY) || 0);
  const centerX = Number(input.centerX) || 0;
  const centerY = Number(input.centerY) || 0;
  const cosY = Math.cos(rotationY); const sinY = Math.sin(rotationY);
  const rotatedX = point.x * cosY - point.z * sinY;
  const rotatedZ = point.x * sinY + point.z * cosY;
  const cosX = Math.cos(rotationX); const sinX = Math.sin(rotationX);
  const rotatedY = point.y * cosX - rotatedZ * sinX;
  const depth = point.y * sinX + rotatedZ * cosX;
  const perspective = 1 / (1.08 - depth * .1);
  return { x: centerX + rotatedX * scaleX * perspective, y: centerY - rotatedY * scaleY * perspective, depth };
}

export function graphDragRotationDirections(point, input = {}) {
  const epsilon = .001;
  const rotationX = Number(input.rotationX) || 0;
  const rotationY = Number(input.rotationY) || 0;
  const horizontalBefore = projectCapabilityGraphPoint(point, { ...input, rotationY: rotationY - epsilon });
  const horizontalAfter = projectCapabilityGraphPoint(point, { ...input, rotationY: rotationY + epsilon });
  const verticalBefore = projectCapabilityGraphPoint(point, { ...input, rotationX: rotationX - epsilon });
  const verticalAfter = projectCapabilityGraphPoint(point, { ...input, rotationX: rotationX + epsilon });
  const horizontalDelta = horizontalAfter.x - horizontalBefore.x;
  const verticalDelta = verticalAfter.y - verticalBefore.y;
  return {
    rotationY: Math.abs(horizontalDelta) < 1e-7 ? -1 : horizontalDelta > 0 ? 1 : -1,
    rotationX: Math.abs(verticalDelta) < 1e-7 ? 1 : verticalDelta > 0 ? 1 : -1,
  };
}

// Solve the two rotation increments that make the pressed node follow the
// pointer in screen space. A single-axis sign flip is not sufficient here:
// perspective projection makes the horizontal derivative change sign for
// nodes at different depths. The local Jacobian keeps both axes coupled and
// therefore works consistently on the left, centre and right side of the
// graph while the projection pivot remains the canvas centre.
export function graphDragRotationDelta(point, input = {}, targetDelta = {}) {
  const epsilon = 0.0005;
  const desiredX = Number(targetDelta.x) || 0;
  const desiredY = Number(targetDelta.y) || 0;
  let currentX = Number(input.rotationX) || 0;
  let currentY = Number(input.rotationY) || 0;
  const start = projectCapabilityGraphPoint(point, { ...input, rotationX: currentX, rotationY: currentY });
  let movedX = 0;
  let movedY = 0;

  function derivatives() {
    const xBefore = projectCapabilityGraphPoint(point, { ...input, rotationX: currentX - epsilon, rotationY: currentY });
    const xAfter = projectCapabilityGraphPoint(point, { ...input, rotationX: currentX + epsilon, rotationY: currentY });
    const yBefore = projectCapabilityGraphPoint(point, { ...input, rotationX: currentX, rotationY: currentY - epsilon });
    const yAfter = projectCapabilityGraphPoint(point, { ...input, rotationX: currentX, rotationY: currentY + epsilon });
    return {
      horizontalX: (xAfter.x - xBefore.x) / (2 * epsilon),
      horizontalY: (yAfter.x - yBefore.x) / (2 * epsilon),
      verticalX: (xAfter.y - xBefore.y) / (2 * epsilon),
      verticalY: (yAfter.y - yBefore.y) / (2 * epsilon),
    };
  }

  function moveAxis(amount, axis) {
    if (!amount) return;
    const steps = Math.max(1, Math.ceil(Math.abs(amount) / 1.25));
    const stepTarget = amount / steps;
    for (let index = 0; index < steps; index += 1) {
      const { horizontalX, horizontalY, verticalX, verticalY } = derivatives();
      const first = axis === "horizontal" ? horizontalX : verticalX;
      const second = axis === "horizontal" ? horizontalY : verticalY;
      const magnitude = first * first + second * second;
      if (magnitude < 0.0001) continue;
      let deltaX = first * stepTarget / magnitude;
      let deltaY = second * stepTarget / magnitude;
      const maxStep = 0.16;
      const angularMagnitude = Math.hypot(deltaX, deltaY);
      if (angularMagnitude > maxStep) {
        const factor = maxStep / angularMagnitude;
        deltaX *= factor; deltaY *= factor;
      }
      const before = projectCapabilityGraphPoint(point, { ...input, rotationX: currentX, rotationY: currentY });
      let factor = 1;
      let after = projectCapabilityGraphPoint(point, { ...input, rotationX: currentX + deltaX, rotationY: currentY + deltaY });
      let actual = axis === "horizontal" ? after.x - before.x : after.y - before.y;
      // Keep the local move on the same side of zero as the pointer. This
      // guards against crossing a perspective pole in a single coalesced event.
      while (actual * stepTarget <= 0 && factor > 0.001) {
        factor *= .5;
        after = projectCapabilityGraphPoint(point, { ...input, rotationX: currentX + deltaX * factor, rotationY: currentY + deltaY * factor });
        actual = axis === "horizontal" ? after.x - before.x : after.y - before.y;
      }
      if (actual * stepTarget <= 0) continue;
      deltaX *= factor; deltaY *= factor;
      currentX += deltaX; currentY += deltaY;
      movedX += deltaX; movedY += deltaY;
    }
  }

  // Resolve horizontal and vertical pointer movement independently. This
  // intentionally allows a little cross-axis drift, but guarantees that the
  // pressed node never reverses the axis the user is actively dragging.
  moveAxis(desiredX, "horizontal");
  moveAxis(desiredY, "vertical");
  const projected = projectCapabilityGraphPoint(point, { ...input, rotationX: currentX, rotationY: currentY });
  return { rotationX: movedX, rotationY: movedY, projected: projected ?? start };
}

function walk(edges, startKey, direction) {
  const result = new Set(); const queue = [startKey];
  while (queue.length) {
    const key = queue.shift();
    for (const edge of edges) {
      const matches = direction === "upstream" ? edge.targetKey === key : edge.sourceKey === key;
      if (!matches) continue;
      const next = direction === "upstream" ? edge.sourceKey : edge.targetKey;
      if (next === startKey || result.has(next)) continue;
      result.add(next); queue.push(next);
    }
  }
  return result;
}

export function traceCapabilityPath(edges, selectedKey) {
  if (!selectedKey) return { prerequisites: [], unlocks: [], edgeKeys: [] };
  const prerequisites = [...walk(edges, selectedKey, "upstream")];
  const unlocks = [...walk(edges, selectedKey, "downstream")];
  const pathNodes = new Set([selectedKey, ...prerequisites, ...unlocks]);
  const edgeKeys = edges.filter((edge) => pathNodes.has(edge.sourceKey) && pathNodes.has(edge.targetKey))
    .map((edge) => `${edge.sourceKey}->${edge.targetKey}`);
  return { prerequisites, unlocks, edgeKeys };
}

export function visibleCapabilityGraph(nodes, edges, selectedKey, mode = "teacher") {
  if (mode !== "student" || !selectedKey) return { nodes: [...nodes], edges: [...edges] };
  const path = traceCapabilityPath(edges, selectedKey);
  const selected = nodes.find((node) => node.key === selectedKey);
  const keys = new Set([selectedKey, ...path.prerequisites, ...path.unlocks]);
  if (selected?.domainKey) keys.add(selected.domainKey);
  const visibleNodes = nodes.filter((node) => keys.has(node.key));
  const visibleKeys = new Set(visibleNodes.map((node) => node.key));
  return { nodes: visibleNodes, edges: edges.filter((edge) => visibleKeys.has(edge.sourceKey) && visibleKeys.has(edge.targetKey)) };
}

// Kept for compatibility with saved layout consumers; new UI uses capabilityGraphPoint.
export function capabilitySpherePoint(key, index, total) {
  const offset = ((capabilityCloudHash(key) % 1000) / 1000 - .5) * .35;
  const y = 1 - ((Number(index) + .5) / Math.max(1, Number(total))) * 2;
  const radius = Math.sqrt(Math.max(0, 1 - y * y));
  const angle = Number(index) * Math.PI * (3 - Math.sqrt(5)) + offset;
  return { x: Math.cos(angle) * radius, y, z: Math.sin(angle) * radius };
}

export function projectCapabilityPoint(point, input = {}) {
  const rotationX = Number(input.rotationX) || 0;
  const rotationY = Number(input.rotationY) || 0;
  const scale = Math.max(0, Number(input.scale) || 0);
  const centerX = Number(input.centerX) || 0;
  const centerY = Number(input.centerY) || 0;
  const cosY = Math.cos(rotationY); const sinY = Math.sin(rotationY);
  const x1 = point.x * cosY - point.z * sinY; const z1 = point.x * sinY + point.z * cosY;
  const cosX = Math.cos(rotationX); const sinX = Math.sin(rotationX);
  const y1 = point.y * cosX - z1 * sinX; const depth = point.y * sinX + z1 * cosX;
  const perspective = 1 / (1.7 - depth * .32);
  return { x: centerX + x1 * scale * perspective, y: centerY + y1 * scale * perspective, depth };
}
