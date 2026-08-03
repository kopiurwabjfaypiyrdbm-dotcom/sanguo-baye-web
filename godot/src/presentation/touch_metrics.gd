## Shared platform-aware touch sizing for native presentation controls.
##
## Layout coordinates are logical viewport units. Android reports physical
## screen density through DPI, so a 48 dp target must be converted back into
## logical units using the current canvas-to-physical scale. Desktop and test
## environments retain the historical 48 physical-pixel floor.
class_name TouchMetrics
extends RefCounted

const BASE_TARGET_DP := 48.0
const BASE_DPI := 160.0
const MIN_DENSITY_SCALE := 1.0
const MAX_DENSITY_SCALE := 4.0
const TOUCH_DRAG_DP := 14.0


static func density_scale() -> float:
	if not OS.has_feature("mobile"):
		return MIN_DENSITY_SCALE
	return density_scale_for_dpi(float(DisplayServer.screen_get_dpi()))


static func density_scale_for_dpi(dpi: float) -> float:
	if dpi <= 0.0:
		return MIN_DENSITY_SCALE
	return clampf(dpi / BASE_DPI, MIN_DENSITY_SCALE, MAX_DENSITY_SCALE)


static func target_size(canvas_scale: float, density: float = -1.0) -> float:
	var effective_density := density_scale() if density < 0.0 else maxf(MIN_DENSITY_SCALE, density)
	return ceilf(BASE_TARGET_DP * effective_density / maxf(canvas_scale, 0.01))


static func drag_threshold(canvas_scale: float, density: float = -1.0) -> float:
	var effective_density := density_scale() if density < 0.0 else maxf(MIN_DENSITY_SCALE, density)
	return ceilf(TOUCH_DRAG_DP * effective_density / maxf(canvas_scale, 0.01))
