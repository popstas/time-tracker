$(function(){
	less.logLevel = 0;
	less.watch();

	/*$( '.sortable' ).sortable({
        placeholder: 'ui-state-highlight'
    });*/
	$('.sortable').nestedSortable({
		listType:'ul',
        handle:'div',
        items:'li',
        toleranceElement:'> div',
		placeholder: 'ui-state-highlight'
    });

	$('#task-list').tooltip();

	var Task = Backbone.Model.extend({
		initialize: function () {
			if (!this.get('name')) this.set({name: '...'});
			if (!this.get('time_plan')) this.set({time_plan: 0});
			if (!this.get('time')) this.set({time: 0});
			if (!this.get('started')) this.set({started: false});
			if (!this.get('comment')) this.set({comment: ''});
			if(this.get('started')) this.start();
			this.save(); // TODO: сохранение при создании сделано только из-за того, что шаблону нужен id
		},

		toggle: function () {
			this.stop();
			this.save({ done: !this.get('done') });
		},

		start: function () {
			//console.log(this.attributes);
			//console.log((new Date().getTime() - this.get('startTimestamp')) / 1000);
			this.set({started:true});
			if(this.get('startTimestamp')){
				this.changeTime(this);
			}
			this.set({ startTimestamp: new Date().getTime() });
			this.set({startTime: this.get('time')});
			this.save();
			var task = this;
			this.interval = setInterval(function(){
				task.changeTime(task)
			}, 1000);
		},

		changeTime: function(task){
			//console.log((new Date().getTime() - this.get('startTimestamp')));
			task.set({time: Math.round(
				task.get('startTime') +
				(new Date().getTime() - task.get('startTimestamp')) / 1000
			)});
		},

		stop: function () {
			this.save({
				started:false,
				startTime: false,
				startTimestamp: false
			});
			clearInterval(this.interval);
		},

		clear: function () {
			this.destroy();
			this.view.remove();
		}
	});


	var TaskList = Backbone.Collection.extend({
		model: Task,
		localStorage: new Store('tasks'),

		done: function () {
			return this.filter(function (task) {
				return task.get('done');
			});
		},

		remaining: function () {
			return this.without.apply(this, this.done());
		},

		totalTime: function(field) {
			return _.reduce(
				this.pluck(field),
				function(totalTime, time){
					return totalTime + time;
				}
			);
		},

		nextOrder: function () {
			if (!this.length) return 1;
			return this.last().get('order') + 1;
		},

		comparator: function (task) {
			return task.get('order');
		},

		/*saveAll: function () {
			this.each(function (task) {
				task.save();
			})
		}*/
	});

	var tasks = new TaskList();


	var TaskView = Backbone.View.extend({
		tagName: 'li',

		template: _.template($('#item-template').html()),


		// TODO: некоторые события цепляют дочерние задачи
		events: {
			'click .check': 'toggleDone',
			'dblclick .task-name:first,.task-time_plan:first,.task-time:first': 'edit',
			'click .task-edit:first': 'edit',
			'click': 'focus',
			'click .task-destroy:first': 'clear',
			'click .task-start': 'start',
			'click .task-stop': 'stop',
			'click .task-comment': 'editComment',
			'keydown [name="name"]:first': 'keypress',
			'keydown [name="time_plan"]:first': 'keypress',
			'keydown [name="time"]:first': 'keypress'
		},

		initialize: function () {
			_.bindAll(this, 'render', 'close');
			this.id = '#'+this.model.get('id');
			this.model.bind('change', this.render);
			this.model.view = this;
		},

		render: function (task) {
			if(task && task.changed.time){
				// TODO: нужен более цивильный способ обновлять время
				$(this.id).find('.time').html(
					$('.time', this.template(this.model.toJSON())).html()
				);
			}
			else{
				$(this.id).remove();
				$(this.el).prepend(this.template(this.model.toJSON()));
				this.setContent();
			}
			return this;
		},

		setContent: function () {
			var vals = {
				name: this.model.get('name'),
				time_plan: Math.round(this.model.get('time_plan')/60),
				time: Math.round(this.model.get('time')/60)
			};
			$(this.id).find('.task-name').text(vals.name);
			this.inputs = $(this.id).find('input');
			var fields = ['name', 'time_plan', 'time'];
			for(var i in fields){
				//$(this.id).find('[name="'+fields[i]+'"]').val(vals[fields[i]]);
				$(this.$('[name="'+fields[i]+'"]')).val(vals[fields[i]]);
			}
			// TODO: при переключении фокуса с времени на название задачи происходит потеря фокуса и сохранение
			this.inputs.find('[name="time"]').bind('blur', this.close);
		},

		toggleDone: function () {
			this.model.toggle();
		},

		focus: function(){
			// TODO: модель задачи влезает в другие модели
			// TODO: привязка к DOM
			var isFocused = $(this.id).hasClass('focused');
			$('.task').removeClass('focused');
			if(!isFocused) $(this.id).addClass('focused');
		},

		edit: function (e) {
			$(this.id).addClass('editing');
			console.log($(e.target));
			if($(e.target).hasClass('task-time')) $(this.id).find('[name="time"]').focus().select();
			else if($(e.target).hasClass('task-time_plan')) $(this.id).find('[name="time_plan"]').focus().select();
			else $(this.id).find('[name="name"]').focus().select();
		},

		editComment: function(){
			var tmpl = _.template($('#comment-edit-template').html());
			var html = tmpl(this.model.toJSON());
			// TODO: не надо события засовывать где попало, отсюда и task = this
			var task = this;
			$(html).dialog({
				title: 'Изменение комментария',
				width:400,
				modal: true,
				buttons:{
					'Сохранить': function(){
						// TODO: по идее тут может пойматься коммент от любой задачи
						task.model.save({ comment: $('[name="comment"]').val() });
						$('.ui-dialog-content').dialog('destroy');
					}
				}
			});
		},

		close: function (isSave) {
			if(isSave==undefined) isSave = true;
			if(isSave){
				this.model.save({
					name: $(this.id).find('[name="name"]').val(),
					time_plan: parseInt($(this.id).find('[name="time_plan"]').val())*60,
					time: parseInt($(this.id).find('[name="time"]').val())*60
				});
			}
			$(this.id).removeClass('editing');
		},

		keypress: function (e) {
			if (e.keyCode == 13) this.close();
			if (e.keyCode == 27){
				$(this.id).find('[name="name"]').val(this.model.get('name'));
				$(this.id).find('[name="time_plan"]').val(Math.round(this.model.get('time_plan')/60));
				$(this.id).find('[name="time"]').val(Math.round(this.model.get('time_plan')/60));
				this.close(false);
			}
		},

		start: function(){
			tasks.each(this.stopTask);
			this.model.start();
		},

		stop: function(){
			this.model.stop();
		},

		stopTask: function(task){
			task.stop();
		},

		remove: function () {
			$(this.el).remove();
		},

		clear: function () {
			if(confirm('Удалить задачу?')){
				this.model.clear();
				// TODO: вложенные задачи визуально пропадают, но не удаляются
				//tasks.trigger('refresh');
			}
		}
	});


	var AppView = Backbone.View.extend({
		el: $('body'),

		statsTemplate: _.template($('#stats-template').html()),
		settingsTemplate: _.template($('#settings-template').html()),

		// TODO: to model
		settings:{

		},

		events:{
			'keypress #new-task': 'createOnEnter',
			'sortupdate #task-list': 'updateOrder',
			'click header .settings': 'showSettings',
			'click .export-json': 'exportJson',
			'click .export-table': 'exportTable',
			'click .export-email': 'exportEmail'
		},

		initialize: function(){
			_.bindAll(this, 'addTask', 'addAllTasks', 'render');

			this.inputs = this.$('#new-task input');

			tasks.fetch();
			//tasks.sort();
			tasks.bind('add', this.addTask);
			tasks.bind('refresh', this.addAllTasks);
			tasks.bind('all', this.render);
			this.addAllTasks();
		},

		render: function () {
			this.$('#task-stats').html(this.statsTemplate({
				total: tasks.length,
				done: tasks.done().length,
				remaining: tasks.remaining().length,
				total_time: tasks.totalTime('time'),
				total_time_plan: tasks.totalTime('time_plan')
			}));
		},

		addTask: function (task) {
			var view = new TaskView({model: task});
			this.$('#task-list').append(view.render().el);
		},

		addAllTasks: function () {
			tasks.each(this.addTask);
		},

		newAttributes: function () {
			var attrs = {
				name: '...',
				order: tasks.nextOrder(),
				done: false,
				time_plan: 0,
				time: 0,
				comment: '',
				started: false,
				startTime: 0,
				startTimestamp: false
			};
			// TODO: в таких местах полный гон, надо выделить обработчики полей
			this.inputs.each(function(){
				var name = $(this).attr('name');
				if(name=='time'||name=='time_plan') attrs[name] = $(this).val()*60;
				else attrs[name] = $(this).val();
				//console.log(name);
			});
			//console.log(attrs);
			return attrs;
		},

		createOnEnter: function (e) {
			if (e.keyCode != 13) return;
			if(!this.createFromJSON()){
				tasks.create(this.newAttributes());
			}
			this.inputs.val('');
		},

		// если в поле вписан json, считаем его дампом коллекции задач
		createFromJSON: function(){
			var name = $('#new-task').find('[name="name"]').val();
			if(name.match(/^\[/)){
				var json = JSON.parse(name);
				$.each(json, function(i, task){
					tasks.create(task);
				});
				return true;
			}
			return false;
		},

		/*keypress: function(e,u){
			console.log(e);
			console.log(u);
			if (e.keyCode == 113) this.edit();
		},*/

		updateOrder: function(){
			var order = 1;
			// TODO: тут привязка к DOM, можно и получше
			$('#task-list .task').each(function(){
				var id = $(this).attr('id');
				var task = tasks.get(id);
				task.save({order:order});
				order++;
			});
		},

		showSettings: function(){
			var html = this.settingsTemplate(this.settings);

			$(html).dialog({
				title: 'Настройки',
				width: 400,
				modal: true
			});
		},

		exportJson: function(){
			var tmpl = _.template($('#export-json-template').html());
			var html = tmpl({
				json: JSON.stringify(tasks)
			});
			$(html).dialog({
				title: 'Экспорт в JSON',
				width:400,
				modal: true
			});
			$('.json-data').select();
		},

		exportTable: function(){
			alert('Возможно, потом эта функция появится');
		},

		exportEmail: function(){
			alert('Возможно, потом эта функция появится');
		}

	});

	var App = new AppView;
});
