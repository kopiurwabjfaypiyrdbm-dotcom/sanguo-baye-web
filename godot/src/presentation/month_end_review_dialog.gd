## Web-aligned month-end preflight surface. Owns no GameSession mutations.
class_name MonthEndReviewDialog
extends PanelContainer

const TouchMetrics = preload("res://src/presentation/touch_metrics.gd")

signal confirmed
signal cancelled
signal city_selected(city_id: String)

@onready var title_label: Label = %TitleLabel
@onready var metrics_label: Label = %MetricsLabel
@onready var actions_label: Label = %ActionsLabel
@onready var notices_box: VBoxContainer = %NoticesBox
@onready var empty_notices_label: Label = %EmptyNoticesLabel
@onready var cancel_button: Button = %CancelButton
@onready var confirm_button: Button = %ConfirmButton
@onready var close_button: Button = %CloseButton
@onready var body_scroll: ScrollContainer = %BodyScroll

var _busy := false


func _ready() -> void:
	close_button.pressed.connect(func() -> void: cancelled.emit())
	cancel_button.pressed.connect(func() -> void: cancelled.emit())
	confirm_button.pressed.connect(func() -> void: confirmed.emit())
	hide()


func show_review(review: Dictionary) -> void:
	title_label.text = tr("确认结束 %d 年 %d 月") % [int(review.get("year", 0)), int(review.get("month", 0))]
	metrics_label.text = tr("%d 人已行动 · %d 人未行动 · %d 座城池 · %d 项在途命令") % [
		int(review.get("actedOfficerCount", 0)),
		int(review.get("availableOfficerCount", 0)),
		int(review.get("playerCityCount", 0)),
		int(review.get("strategicOrderCount", 0)) + int(review.get("diplomaticOrderCount", 0)),
	]
	var actions: Array = review.get("actions", []) if review.get("actions") is Array else []
	if actions.is_empty():
		actions_label.text = tr("尚未记录会改变战役状态的主要行动。")
	else:
		var lines: PackedStringArray = PackedStringArray()
		for raw_action: Variant in actions:
			lines.append("· %s" % str(raw_action))
		actions_label.text = "\n".join(lines)
	for child: Node in notices_box.get_children():
		if child == empty_notices_label:
			continue
		child.queue_free()
	var notices: Array = review.get("notices", []) if review.get("notices") is Array else []
	empty_notices_label.visible = notices.is_empty()
	for raw_notice: Variant in notices:
		if not raw_notice is Dictionary:
			continue
		var notice: Dictionary = raw_notice
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 8)
		var text_col := VBoxContainer.new()
		text_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var title := Label.new()
		title.text = str(notice.get("title", ""))
		title.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		match str(notice.get("tone", "info")):
			"critical":
				title.add_theme_color_override("font_color", Color("#ff9a8a"))
			"warning":
				title.add_theme_color_override("font_color", Color("#ffd074"))
			_:
				title.add_theme_color_override("font_color", Color("#b8dac2"))
		var detail := Label.new()
		detail.text = str(notice.get("detail", ""))
		detail.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		detail.add_theme_color_override("font_color", Color(0.75, 0.8, 0.78, 1))
		text_col.add_child(title)
		text_col.add_child(detail)
		row.add_child(text_col)
		var city_id := str(notice.get("cityId", ""))
		if not city_id.is_empty():
			var view_button := Button.new()
			view_button.text = tr("查看城池")
			view_button.custom_minimum_size = Vector2(96, 44)
			view_button.pressed.connect(func() -> void: city_selected.emit(city_id))
			row.add_child(view_button)
		notices_box.add_child(row)
	show()


func place_in(usable: Rect2) -> void:
	reset_size()
	var size := get_combined_minimum_size()
	size.x = clampf(usable.size.x - 24.0, 360.0, 640.0)
	size.y = clampf(usable.size.y - 24.0, 280.0, mini(usable.size.y - 16.0, 560.0))
	self.size = size
	position = usable.position + (usable.size - size) * 0.5


func apply_responsive_layout(compact: bool, canvas_scale: float, _physical_size: Vector2i) -> void:
	var touch_mode := compact or TouchMetrics.uses_density_scaled_targets()
	var touch_size := TouchMetrics.target_size(canvas_scale) if touch_mode else 48.0
	var font_size := ceili(15.0 / maxf(canvas_scale, 0.01)) if touch_mode else 15
	title_label.add_theme_font_size_override("font_size", ceili(20.0 / maxf(canvas_scale, 0.01)) if touch_mode else 22)
	metrics_label.add_theme_font_size_override("font_size", font_size)
	actions_label.add_theme_font_size_override("font_size", font_size)
	empty_notices_label.add_theme_font_size_override("font_size", font_size)
	body_scroll.custom_minimum_size = Vector2(0.0, 160.0 if touch_mode else 180.0)
	for button: Button in [close_button, cancel_button, confirm_button]:
		button.custom_minimum_size = Vector2(ceilf(110.0 / maxf(canvas_scale, 0.85)) if touch_mode else 120.0, touch_size)
		button.add_theme_font_size_override("font_size", ceili(16.0 / maxf(canvas_scale, 0.01)) if touch_mode else 16)
	for child: Node in notices_box.get_children():
		if child is HBoxContainer:
			for nested: Node in child.get_children():
				if nested is Button:
					(nested as Button).custom_minimum_size = Vector2(touch_size * 1.8 if touch_mode else 96.0, touch_size)


func set_busy(busy: bool) -> void:
	_busy = busy
	cancel_button.disabled = busy
	confirm_button.disabled = busy
	close_button.disabled = busy
