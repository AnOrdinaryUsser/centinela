import 'dotenv/config'

// Distance (in meters) below which a detection is considered close enough
// to a registered legal facility to likely BE that facility (a false
// positive) rather than an illegal dump next to it. Configurable because
// the right value depends on the model's typical localization error and
// on how densely the legal facilities are mapped.
const LEGAL_FACILITY_RADIUS_METERS = Number(process.env.LEGAL_FACILITY_RADIUS_METERS) || 100

// Classifies a detection as a likely legal facility (false positive), a
// probable illegal dump, or a critical illegal dump (inside a protected
// natural area), using the open-data context already computed for it.
//
// This is intentionally a simple, explainable rule rather than a black box:
// for a public-sector tool, being able to say *why* something was flagged
// matters as much as the flag itself.
export function classifyDetection({ nearestLegalFacility, protectedArea }) {
  const isNearLegalFacility =
    !!nearestLegalFacility &&
    typeof nearestLegalFacility.distance_meters === 'number' &&
    nearestLegalFacility.distance_meters <= LEGAL_FACILITY_RADIUS_METERS

  if (isNearLegalFacility) {
    return {
      status: 'legal_probable',
      label: 'Posible instalación legal (falso positivo)',
      severity: 'info',
      reason: `A menos de ${LEGAL_FACILITY_RADIUS_METERS} m de "${nearestLegalFacility.name}", un centro de gestión de residuos registrado.`,
    }
  }

  if (protectedArea) {
    return {
      status: 'illegal_critical',
      label: 'Vertedero ilegal probable — dentro de espacio protegido',
      severity: 'critical',
      reason: `No hay ninguna instalación legal cerca, y la zona cae dentro de "${protectedArea.name}" (${protectedArea.protection_category ?? 'espacio protegido'}).`,
    }
  }

  return {
    status: 'illegal_probable',
    label: 'Vertedero ilegal probable',
    severity: 'warning',
    reason: 'No hay ninguna instalación de gestión de residuos legal registrada en las proximidades.',
  }
}

export const LEGAL_FACILITY_RADIUS = LEGAL_FACILITY_RADIUS_METERS
