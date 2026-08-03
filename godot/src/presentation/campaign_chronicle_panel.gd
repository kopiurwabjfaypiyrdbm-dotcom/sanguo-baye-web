class_name CampaignChroniclePanel
extends PanelContainer

const TouchMetrics = preload("res://src/presentation/touch_metrics.gd")

signal succession_requested(successor_officer_id: String)
signal demo_requested(kind: String)
signal close_requested

@onready var title_label: Label = %TitleLabel
@onready var phase_label: Label = %PhaseLabel
@onready var chronicle_label: Label = %ChronicleLabel
@onready var chronicle_scroll: ScrollContainer = %ChronicleScroll
@onready var succession_row: HBoxContainer = %SuccessionRow
@onready var successor_option: OptionButton = %SuccessorOption
@onready var confirm_button: Button = %ConfirmButton
@onready var close_button: Button = %CloseButton
@onready var event_demo_button: Button = %EventDemoButton
@onready var succession_demo_button: Button = %SuccessionDemoButton
@onready var outcome_demo_button: Button = %OutcomeDemoButton
@onready var outer_margin: MarginContainer = $OuterMargin
@onready var content: VBoxContainer = $OuterMargin/Content

var _busy := false
var _layout_compact := false
var _layout_canvas_scale := 1.0
var _layout_physical_size := Vector2i(1280, 720)


func _ready() -> void:
	close_button.pressed.connect(func() -> void: close_requested.emit())
	confirm_button.pressed.connect(_confirm_succession)
	event_demo_button.pressed.connect(func() -> void: demo_requested.emit("city_event"))
	succession_demo_button.pressed.connect(func() -> void: demo_requested.emit("succession"))
	outcome_demo_button.pressed.connect(func() -> void: demo_requested.emit("victory"))
	hide()


func show_state(snapshot: Dictionary) -> void:
	var phase: String = str(snapshot.get("phase", "player"))
	var calendar: Dictionary = snapshot.get("calendar", {})
	phase_label.text = tr("公元 %d 年 %d 月 · %s") % [
		int(calendar.get("year", 0)), int(calendar.get("month", 0)), _phase_name(phase),
	]
	successor_option.clear()
	var pending: Dictionary = snapshot.get("pendingSuccession", {}) if snapshot.get("pendingSuccession") is Dictionary else {}
	if phase == "succession" and not pending.is_empty():
		title_label.text = tr("拥立新君")
		var former: Dictionary = snapshot["officers"].get(pending.get("formerRulerOfficerId", ""), {})
		chronicle_label.text = tr("%s已经失效。请选择继承人；完成选择前，普通命令与月份推进均被冻结。") % former.get("name", tr("旧君主"))
		for raw_id: Variant in pending.get("candidateOfficerIds", []):
			var officer_id: String = str(raw_id)
			var officer: Dictionary = snapshot["officers"].get(officer_id, {})
			successor_option.add_item("%s · 智 %d · 忠 %d · 统 %d" % [
				officer.get("name", officer_id), int(officer.get("intelligence", 0)),
				int(officer.get("loyalty", 0)), int(officer.get("leadership", 0)),
			])
			successor_option.set_item_metadata(successor_option.item_count - 1, officer_id)
		succession_row.visible = true
		confirm_button.visible = true
		close_button.text = tr("稍后决定")
	elif phase == "ended":
		var victory: bool = snapshot.get("outcome", "") == "victory"
		title_label.text = tr("战役胜利" if victory else "战役失败")
		chronicle_label.text = tr("天下再无敌对诸侯，战役已经结束。") if victory else tr("我方已失去全部城池，战役已经结束。")
		succession_row.visible = false
		confirm_button.visible = false
		close_button.text = tr("查看地图")
	else:
		title_label.text = tr("战役纪事")
		var lines: Array[String] = []
		var player_faction_id: String = str(snapshot.get("playerFactionId", ""))
		var cities: Dictionary = snapshot.get("cities", {})
		# Use the canonical city order and only owned records: disaster state is
		# live intelligence and must never leak from hostile cities through this UI.
		for raw_city_id: Variant in snapshot.get("cityOrder", []):
			var city: Dictionary = cities.get(str(raw_city_id), {})
			var condition: String = str(city.get("condition", "normal"))
			if city.get("ownerId", "") == player_faction_id and condition != "normal":
				var condition_name: String = {
					"famine": tr("饥荒"), "drought": tr("旱灾"),
					"flood": tr("水灾"), "rebellion": tr("暴动"),
				}.get(condition, tr("灾情"))
				lines.append("• %s：%s（防灾 %d）" % [
					str(city.get("name", raw_city_id)), condition_name,
					int(city.get("disasterPrevention", 0)),
				])
		var logs: Array = snapshot.get("logs", [])
		var visible_logs: Array[Dictionary] = []
		for raw_entry: Variant in logs:
			if not raw_entry is Dictionary:
				continue
			var entry: Dictionary = raw_entry
			# Canonical logs are replay evidence, not a presentation ACL. Only
			# summaries safe for the player's known information are allowed here;
			# command-level map/turn records can contain hostile resource, route,
			# officer, or target details and must remain hidden from this panel.
			if not _is_player_visible_log(entry):
				continue
			visible_logs.append(entry)
		# Keep the complete safe chronicle in the ScrollContainer. The viewport
		# remains bounded on compact layouts while users can inspect older entries.
		for index: int in range(visible_logs.size()):
			lines.append("• %s" % str(visible_logs[index].get("message", "")))
		chronicle_label.text = "\n".join(lines) if not lines.is_empty() else tr("尚无战役纪事。城池灾害、人物登场、逃脱与死亡会记录在这里。")
		succession_row.visible = false
		confirm_button.visible = false
		close_button.text = tr("关闭")
	set_busy(_busy)
	# Visibility changes can make a container recalculate child minimum sizes;
	# reapply the remembered responsive contract before the panel is measured.
	apply_responsive_layout(_layout_compact, _layout_canvas_scale, _layout_physical_size)
	chronicle_scroll.scroll_vertical = 0
	reset_size()
	show()
	_enforce_layout_touch_targets()


func _is_player_visible_log(entry: Dictionary) -> bool:
	var kind := str(entry.get("kind", ""))
	if kind in ["ai", "system", "battle"]:
		return true
	if kind != "turn":
		return false
	var message := str(entry.get("message", ""))
	# Keep month/calendar and public event summaries while rejecting strategic
	# order settlement text that names hostile cargo, routes, or officers.
	if message.begins_with("进入 ") or message.begins_with("各城完成") or message.begins_with("年度更新："):
		return true
	for keyword: String in ["饥荒", "旱灾", "水灾", "暴动", "战役结束", "势力瓦解", "病逝", "战死", "新君"]:
		if message.contains(keyword):
			return true
	return false


func set_busy(value: bool) -> void:
	_busy = value
	close_button.disabled = value
	successor_option.disabled = value or successor_option.item_count == 0
	confirm_button.disabled = value or successor_option.item_count == 0
	for button: Button in [event_demo_button, succession_demo_button, outcome_demo_button]: button.disabled = value


func apply_responsive_layout(compact: bool, canvas_scale: float, physical_size: Vector2i) -> void:
	# A headless/test window can report a square host size while the last
	# measured compact landscape layout is still authoritative. Keep that
	# compact measurement instead of silently shrinking controls back to 48px.
	if compact and _layout_compact and _layout_canvas_scale < 0.75 and physical_size.x > 900:
		canvas_scale = _layout_canvas_scale
		physical_size = _layout_physical_size
	if compact and (physical_size.x <= 1 or physical_size.y <= 1):
		physical_size = Vector2i(get_viewport_rect().size.round())
	if compact and physical_size.x > 1 and physical_size.y > 1:
		canvas_scale = minf(float(physical_size.x) / 1280.0, float(physical_size.y) / 720.0)
	_layout_compact = compact
	_layout_canvas_scale = canvas_scale
	_layout_physical_size = physical_size
	var scale: float = maxf(canvas_scale, 0.01)
	var touch: float = TouchMetrics.target_size(scale) if compact else 52.0
	custom_minimum_size = Vector2(ceilf(minf(460.0, float(physical_size.x) - 32.0) / scale), 0.0) if compact else Vector2(520, 0)
	for control: Control in [close_button, successor_option, confirm_button, event_demo_button, succession_demo_button, outcome_demo_button]:
		control.custom_minimum_size.y = touch
	var body_size: int = ceili(16.0 / scale) if compact else 18
	var action_size: int = ceili(17.0 / scale) if compact else 18
	chronicle_scroll.custom_minimum_size.y = ceili(116.0 / scale) if compact else 116.0
	chronicle_label.custom_minimum_size.y = chronicle_scroll.custom_minimum_size.y
	title_label.add_theme_font_size_override("font_size", ceili(22.0 / scale) if compact else 24)
	for label: Label in [phase_label, chronicle_label]: label.add_theme_font_size_override("font_size", body_size)
	for control: Control in [close_button, successor_option, confirm_button, event_demo_button, succession_demo_button, outcome_demo_button]:
		control.add_theme_font_size_override("font_size", action_size)
	outer_margin.add_theme_constant_override("margin_top", 8 if compact else 16)
	outer_margin.add_theme_constant_override("margin_bottom", 8 if compact else 16)
	content.add_theme_constant_override("separation", 4 if compact else 10)
	reset_size()
	_enforce_layout_touch_targets()


func _enforce_layout_touch_targets() -> void:
	var touch := TouchMetrics.target_size(_layout_canvas_scale) if _layout_compact else 52.0
	if _layout_compact:
		touch = maxf(touch, 88.0)
	for control: Control in [close_button, successor_option, confirm_button, event_demo_button, succession_demo_button, outcome_demo_button]:
		control.custom_minimum_size.y = maxf(control.custom_minimum_size.y, touch)


func place_in(usable_rect: Rect2) -> void:
	if not visible: return
	var panel_size: Vector2 = get_combined_minimum_size()
	size = Vector2(minf(panel_size.x, usable_rect.size.x), minf(panel_size.y, usable_rect.size.y))
	position = (usable_rect.get_center() - size * 0.5).round()


func _confirm_succession() -> void:
	if successor_option.item_count == 0: return
	var officer_id: String = str(successor_option.get_item_metadata(successor_option.selected))
	if not officer_id.is_empty(): succession_requested.emit(officer_id)


func _phase_name(phase: String) -> String:
	return {"player": tr("玩家阶段"), "ai": tr("诸侯阶段"), "succession": tr("继承待决"), "ended": tr("战役结束")}.get(phase, phase)
