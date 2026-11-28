'use strict';

// Console messages the browser checks treat as failures. Errors always fail. Three.js PMREM blur
// warnings ("sigmaRadians ... is too large and will clip") are logged as warnings, so they slipped
// past the error-only listeners; they mean an environment map is being blurred with a clipped kernel.
const GATED_WARNING = /PMREMGenerator|sigmaRadians/i;

function failsGate(msg) {
  const type = msg.type();
  return type === 'error' || (type === 'warning' && GATED_WARNING.test(msg.text()));
}

module.exports = { failsGate, GATED_WARNING };
