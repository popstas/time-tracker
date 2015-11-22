$(function () {
    less.logLevel = 0;
    //less.watch();

    $('.sortable').nestedSortable({
        listType: 'ul',
        handle: 'div',
        items: 'li',
        toleranceElement: '> div',
        placeholder: 'ui-state-highlight',
        distance: 15,
        isTree: true,
        cancel: 'input,span'
    });

    $('#task-list').tooltip();

    $('body').addClass('no_time_plan');

    var last = $(window).scrollTop();
    $(window).on('scroll', function (e) {
        var isDown = $(window).scrollTop() > last;
        last = $(window).scrollTop();
        if (isDown || last == 0) $('#content').removeClass('fixed-header');
        else $('#content').addClass('fixed-header');
    });

    var LogItem = Backbone.Model.extend({
        levels: {
            INFO: 0,
            WARNING: 1,
            ERROR: 2
        },

        initialize: function () {
            if (!this.get('date')) this.set({date: new Date().getTime()});
            if (!this.get('level')) this.set({level: this.levels.INFO});
            if (!this.get('text')) this.set({text: ''});
            if ('speechSynthesis' in window) {

            }
        },

        save: function () {
            return false;
        }
    });

    var LogList = Backbone.Collection.extend({
        model: LogItem,
        //localStorage: new Store('log'),

        getByLevel: function (levels) {
            if (levels == undefined || ($.isArray(levels) && levels.length == 0)) return this.all();
            if (!$.isArray(levels)) levels = [levels];
            return this.filter(function (logitem) {
                return levels.indexOf(logitem.get('level')) != -1;
            });
        }
    });

    var Task = Backbone.Model.extend({
        initialize: function () {
            this.set({hidden: false});
            if (!this.get('name')) this.set({name: '...'});
            if (!this.get('time_plan')) this.set({time_plan: 0});
            if (!this.get('time')) this.set({time: 0});
            if (!this.get('started')) this.set({started: false});
            if (!this.get('comment')) this.set({comment: ''});
            if (!this.get('parent')) this.set({parent: false});
            if (this.get('started')) this.start();
            this.save(); // TODO: сохранение при создании сделано только из-за того, что шаблону нужен id
        },

        toggle: function () {
            this.stop();
            this.save({done: !this.get('done')});
        },

        start: function () {
            //console.log(this.attributes);
            //console.log((new Date().getTime() - this.get('startTimestamp')) / 1000);
            this.set({started: true});
            if (this.get('startTimestamp')) {
                this.changeTime(this);
            }
            this.set({startTimestamp: new Date().getTime()});
            this.set({startTime: this.get('time')});
            this.save();
            var task = this;
            this.interval = setInterval(function () {
                task.changeTime(task)
            }, 1000);
            $('#' + task.id).trigger('start', task);
        },

        changeTime: function (task) {
            //console.log((new Date().getTime() - this.get('startTimestamp')));
            task.set({
                time: Math.round(
                    task.get('startTime') +
                    (new Date().getTime() - task.get('startTimestamp')) / 1000
                )
            });
            $('#' + task.id).trigger('timeChanged', task);
        },

        stop: function () {
            this.save({
                started: false,
                startTime: false,
                startTimestamp: false
            });
            clearInterval(this.interval);
            $('#' + this.id).trigger('stop', this);
        },

        clear: function () {
            this.destroy();
            this.view.remove();
        }
    });


    var TaskList = Backbone.Collection.extend({ // ok
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

        totalTime: function (field) {
            return this.length ? _.reduce(
                this.pluck(field),
                function (totalTime, time) {
                    return totalTime + time;
                }
            ) : 0;
        },

        nextOrder: function () {
            if (!this.length) return 1;
            return this.last().get('order') + 1;
        },

        getByOrder: function (order) {
            return this.filter(function (task) {
                //console.log(order+'=='+task.get('order'));
                return order == task.get('order');
            });
        },

        comparator: function (task) {
            return task.get('order');
        },

        focused: function () {
            return this.filter(function (task) {
                return $('#' + task.id).hasClass('focused');
            });
        },

        selectNext: function () {
            if (this.focused().length > 1) return false;
            else if (this.focused().length == 0) {
                $('#' + this.first().id).click();
            }
            else {
                var order = this.focused()[0].get('order');
                var next = this.getByOrder(order + 1);
                if (next.length > 0) $('#' + next[0].id).click();
            }
        },

        selectPrevious: function () {
            if (this.focused().length > 1) return false;
            else if (this.focused().length == 0) {
                $('#' + this.last().id).click();
            }
            else {
                var order = this.focused()[0].get('order');
                var prev = this.getByOrder(order - 1);
                if (prev.length == 1) $('#' + prev[0].id).click();
            }
        },

        zeroTimes: function () {
            this.each(function (task) {
                task.save({time_plan: 0, time: 0});
            })
        }

        /*saveAll: function () {
         this.each(function (task) {
         task.save();
         })
         }*/
    });

    var tasks = new TaskList();


    var TaskView = Backbone.View.extend({
        tagName: 'li',

        template: _.template($('#task-template').html()),


        // TODO: некоторые события цепляют дочерние задачи
        events: {
            'click .check': 'toggleDone',
            'dblclick .task-name:first,.task-time_plan:first,.task-time:first,.task:first': 'edit',
            'click .task-edit:first': 'edit',
            'click :first': 'focus',
            'click .task-destroy:first': 'clear',
            'click .task-start:first': 'start',
            'click .task-stop:first': 'stop',
            'click .task-comment:first': 'editComment',
            'keydown [name="name"]:first': 'keypress',
            'keydown [name="time_plan"]:first': 'keypress',
            'keydown [name="time"]:first': 'keypress'
        },

        initialize: function () {
            _.bindAll(this, 'render', 'close');
            this.id = '#' + this.model.get('id');
            this.model.bind('change', this.render);
            this.model.view = this;
        },

        render: function (task) {
            if (task && task.changed.time) {
                // TODO: нужен более цивильный способ обновлять время
                $(this.id).find('.time').html(
                    $('.time', this.template(this.model.toJSON())).html()
                );
            }
            else {
                $(this.id).remove();
                $(this.el).prepend(this.template(this.model.toJSON()));
                this.setContent();
            }
            return this;
        },

        setContent: function () {
            var vals = {
                name: this.model.get('name'),
                time_plan: Math.round(this.model.get('time_plan') / 60),
                time: Math.round(this.model.get('time') / 60)
            };
            $(this.id).find('.task-name').text(vals.name);
            this.inputs = $(this.id).find('input');
            var fields = ['name', 'time_plan', 'time'], i;
            for (i in fields) {
                //$(this.id).find('[name="'+fields[i]+'"]').val(vals[fields[i]]);
                $(this.$('[name="' + fields[i] + '"]')).val(vals[fields[i]]);
            }
            // TODO: при переключении фокуса с времени на название задачи происходит потеря фокуса и сохранение
            this.inputs.find('[name="time"]').bind('blur', this.close);
        },

        toggleDone: function () {
            this.model.toggle();
        },

        focus: function (e) {
            // TODO: модель задачи влезает в другие модели
            // TODO: привязка к DOM
            var isFocused = $(this.id).hasClass('focused');
            if (!e.ctrlKey) $('.task').removeClass('focused');
            if (!isFocused) $(this.id).addClass('focused');
        },

        edit: function (e) {
            $(this.id).addClass('editing');
            if ($(e.target).is('input')) return;
            //console.log($(e.target));
            if ($(e.target).hasClass('task-time')) $(this.id).find('[name="time"]').focus().select();
            else if ($(e.target).hasClass('task-time_plan')) $(this.id).find('[name="time_plan"]').focus().select();
            else if ($(e.target).hasClass('task-name')) $(this.id).find('[name="name"]').focus().select();
            else $(this.id).find('[name="time"]').focus().select();
        },

        editComment: function () {
            var tmpl = _.template($('#comment-edit-template').html());
            var html = tmpl(this.model.toJSON());
            // TODO: не надо события засовывать где попало, отсюда и task = this
            var task = this;
            $(html).dialog({
                title: 'Edit comment',
                width: 400,
                modal: true,
                buttons: {
                    'Сохранить': function () {
                        // TODO: по идее тут может пойматься коммент от любой задачи
                        task.model.save({comment: $('[name="comment"]').val()});
                        $('.ui-dialog-content').dialog('destroy');
                    }
                }
            });
        },

        close: function (isSave) {
            if (isSave == undefined) isSave = true;
            if (isSave) {
                this.model.save({
                    name: $(this.id).find('[name="name"]').val(),
                    time_plan: parseInt($(this.id).find('[name="time_plan"]').val()) * 60,
                    time: parseInt($(this.id).find('[name="time"]').val()) * 60
                });
            }
            $(this.id).removeClass('editing');
        },

        keypress: function (e) {
            if (e.keyCode == 13) this.close();
            if (e.keyCode == 27) {
                $(this.id).find('[name="name"]').val(this.model.get('name'));
                $(this.id).find('[name="time_plan"]').val(Math.round(this.model.get('time_plan') / 60));
                $(this.id).find('[name="time"]').val(Math.round(this.model.get('time_plan') / 60));
                this.close(false);
            }
        },

        start: function () {
            tasks.each(this.stopTask);
            this.model.start();
        },

        stop: function () {
            this.model.stop();
        },

        stopTask: function (task) {
            task.stop();
        },

        remove: function () {
            $(this.el).remove();
        },

        clear: function () {
            if (confirm('Delete task?')) {
                this.model.clear();
                // TODO: вложенные задачи визуально пропадают, но не удаляются
                //tasks.trigger('refresh');
            }
        }
    });

    var FilterItem = Backbone.Model.extend({
        initialize: function () {
            if (!this.get('name')) return false;
            if (!this.get('label')) return false;
            if (this.get('checked') == undefined) this.set({checked: true});
            if (!this.get('handler')) this.set({
                handler: function () {
                    return false;
                }
            });
            this.save();
        }
    });

    var FilterItemView = Backbone.View.extend({
        tagName: 'li',
        template: _.template($('#filter-item-template').html()),
        events: {
            'change': 'filterChanged'
        },

        initialize: function () {
            //_.bindAll(this, 'render', 'close');
            this.id = '#' + this.model.get('id');
            //this.model.bind('change', this.render);
            this.model.view = this;
        },

        render: function () {
            $(this.id).remove();
            //console.log(this);
            $(this.el).prepend(this.template(this.model.toJSON()));
            return this;
        },

        filterChanged: function () {
            var filter = this.model;
            var isChecked = this.$('input').prop('checked');
            var name = this.$('input').attr('name');
            filter.save({checked: isChecked});
            var filtered = tasks.filter(filter.get('handler'));
            //console.log(filtered);
            if (filtered) $.each(filtered, function (i, task) {
                task.set({hidden: !filter.get('checked')});
            });
        }
    });

    var FilterList = Backbone.Collection.extend({
        model: FilterItem,
        localStorage: new Store('filters')
    });


    var AppView = Backbone.View.extend({
        el: $('body'),
        name: 'Tasks',

        statsTemplate: _.template($('#stats-template').html()),
        settingsTemplate: _.template($('#settings-template').html()),

        // TODO: to model
        settings: {
            notifyEvery: 600
        },

        events: {
            'keypress #new-task': 'createOnEnter',
            'sortupdate #task-list': 'updateOrder',
            'click header .settings': 'showSettings',
            'click header .zero-times': 'zeroTimes',
            'click .export-json': 'exportJson',
            'click .export-table': 'exportTable',
            'click .export-email': 'exportEmail',
            'keypress': 'globalKeypress',
            'timeChanged .task': 'timeChanged',
            'start .task': 'taskStarted',
            'stop .task': 'taskStopped',
            'click .settings-notify-desktop': 'requestNotifyDesktop',
            'click #tasklist-info_file_select': 'gdrivePicker'

            //'change #filters': 'filterChanged'
        },

        initialize: function () {
            _.bindAll(this, 'addTask', 'addAllTasks', 'render');

            this.inputs = this.$('#new-task input');

            tasks.fetch();
            //tasks.sort();
            tasks.bind('add', this.addTask);
            tasks.bind('refresh', this.addAllTasks);
            tasks.bind('all', this.render);
            this.addAllTasks();
            tasks.trigger('all');

            this.loglist = new LogList();
            //this.loglist.create({text: });
            this.notifyDesktop('app started');

            this.filters = new FilterList();
            // каждый раз пересоздаются модели фильтров
            this.filters.fetch();
            //this.filters.reset();
            if (this.filters.filter(function (item) {
                    return item.get('name') == 'done';
                }).length == 0) {
                this.filters.create({
                    name: 'done',
                    label: 'completed',
                    checked: true
                });
            }

            var done = this.filters.filter(function (item) {
                return item.get('name') == 'done';
            });
            done[0].set({
                'handler': function (task) {
                    return task.get('done')
                }
            });

            if (this.filters.filter(function (item) {
                    return item.get('name') == 'zero';
                }).length == 0) {
                this.filters.create({
                    name: 'zero',
                    label: 'zero time',
                    checked: true
                });
            }

            var zero = this.filters.filter(function (item) {
                return item.get('name') == 'zero';
            });
            zero[0].set({
                'handler': function (task) {
                    return task.get('time') == 0
                }
            });

            var cont = $('#filter-list');
            this.filters.each(function (filter) {
                var view = new FilterItemView({model: filter});
                cont.append(view.render().el);
                //filter.destroy();
                $('#' + filter.get('id')).trigger('change');
            });

            //this.syncToDrive('tasks.tasklist');
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

        setTitle: function (title) {
            if (title == '') title = this.name;
            else title = title + ' - ' + this.name;
            $('title').text(title);
        },

        addLog: function (logitem) {

        },

        addTask: function (task) {
            var view = new TaskView({model: task});
            // TODO: убрать жкуери-стайл
            var cont = $('#task-list');
            if (task.get('parent')) {
                var parentView = $('#' + task.get('parent'));
                if (parentView.size() > 0) {
                    cont = parentView.find('+ul');
                    if (cont.size() == 0 && parentView.size() > 0) {
                        cont = $('<ul></ul>').insertAfter(parentView);
                    }
                }
                /*else{
                 task.model.set({ parent: false });
                 }*/
            }
            cont.append(view.render().el);
        },

        addAllTasks: function () {
            tasks.each(this.addTask);
        },

        newAttributes: function () { //ok
            var attrs = {
                name: '...',
                order: tasks.nextOrder(),
                parent: false,
                done: false,
                time_plan: 0,
                time: 0,
                comment: '',
                started: false,
                startTime: 0,
                startTimestamp: false
            };

            if (tasks.focused().length == 1) attrs.parent = $('.task.focused').attr('id');

            // TODO: в таких местах полный гон, надо выделить обработчики полей
            this.inputs.each(function () {
                var name = $(this).attr('name');
                if (name == 'time' || name == 'time_plan') attrs[name] = $(this).val() * 60;
                else attrs[name] = $(this).val();
                //console.log(name);
            });
            //console.log(attrs);
            return attrs;
        },

        createOnEnter: function (e) {
            if (e.keyCode != 13) return;
            if (e.ctrlKey) {
                var focused = tasks.focused();
                if (focused.length > 0) {
                    $.each(focused, function (ind, task) {
                        $('#' + task.id).click();
                    });
                }
            }
            if (!this.createFromJSON()) {
                tasks.create(this.newAttributes());
            }
            this.inputs.val('');
        },

        // если в поле вписан json, считаем его дампом коллекции задач
        createFromJSON: function () {
            var name = $('#new-task').find('[name="name"]').val();
            if (name.match(/^\[/)) {
                var json = JSON.parse(name);
                $.each(json, function (i, task) {
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

        updateOrder: function () {
            var order = 1;
            // TODO: тут привязка к DOM, можно и получше
            $('#task-list .task').each(function () {
                var id = $(this).attr('id');
                var task = tasks.get(id);
                var parentTask = $(this).parents('ul').prev('.task');
                var parent = parentTask.size() > 0 ? parentTask.attr('id') : false;
                task.save({
                    order: order,
                    parent: parent
                });
                order++;
            });
        },

        showSettings: function () {
            var html = this.settingsTemplate(this.settings);

            $(html).dialog({
                title: 'Settings',
                width: 400,
                modal: true
            });
        },

        zeroTimes: function () {
            if (confirm('Reset all tasks time?')) {
                tasks.zeroTimes();
            }
        },

        exportJson: function () {
            var tmpl = _.template($('#export-json-template').html());
            var html = tmpl({
                json: JSON.stringify(tasks)
            });
            $(html).dialog({
                title: 'Export to JSON',
                width: 400,
                modal: true
            });
            $('.json-data').select();
        },

        exportTable: function () {
            alert('Not implemented');
        },

        exportEmail: function () {
            alert('Not implemented');
        },

        globalKeypress: function (e) {
            if (e.keyCode == 46) { // del
                var focused = tasks.focused();
                if (focused.length > 0) {
                    if (confirm('Delete tasks (' + focused.length + ')?')) {
                        $.each(focused, function (ind, task) {
                            task.clear();
                        });
                    }

                }
            }
            if (e.keyCode == 40) { // down
                tasks.selectNext();
            }
            if (e.keyCode == 38) { // up
                tasks.selectPrevious();
            }
        },

        filterChanged: function (e) {

        },

        taskStarted: function (e, task) {

        },

        taskStopped: function (e, task) {
            this.setTitle('');
        },

        timeChanged: function (e, task) {
            this.setTitle(task.get('name') + ' (' + parseInt(task.get('time') / 60) + ':' + (task.get('time') % 60 + '').lpad('0', 2) + ')');
            if (this.settings.notifyEvery > 0) {
                if (task.get('time') % this.settings.notifyEvery == 0) {
                    this.notifyDesktop(task);
                }
            }
        },

        requestNotifyDesktop: function () {
            Notification.requestPermission(function (permission) {
                if (permission != "granted") return false;
                var notify = new Notification("Thanks for letting notify you");
            });
        },

        notifyDesktop: function (msg) {
            var title = msg;
            var body = '';
            if ($.type(msg) == 'object') {
                var task = msg;
                title = task.get('name');
                body = Math.round((new Date().getTime() - task.get('startTimestamp')) / 60000) + ' minutes without pause' + "\n" +
                    Math.round(task.get('time') / 60) + ' minutes total'
            }
            this.loglist.create({text: 'notifyDesktop'});
            var notify = new Notification(title, {
                icon: '/img/icon32.png',
                tag: 'task_notify',
                body: body
            });

        },


        syncToDrive: function (filename) {
            var filename = 'default';
            $.ajax({
                url: 'https://script.google.com/macros/s/AKfycby7KDR9dTNETWNhGLVYiO81QN2t5TQ-9Yvw_HdFoB8/dev',
                data: {json: JSON.stringify(tasks), filename: filename},
                type: 'post',
                dataType: 'jsonp',
                success: function (data) {
                    console.log(data);
                }
            });
        },

        gdrivePicker: function () {
// The Browser API key obtained from the Google Developers Console.
            var googleDeveloperKey = 'ABC123 ... ';

            // The Client ID obtained from the Google Developers Console.
            var clientId = '915615549870-g2j6vpfm7f2gei1oangkuo588pg4h4uk.apps.googleusercontent.com';

            // Scope to use to access user's photos.
            var scope = ['https://www.googleapis.com/auth/photos'];

            var pickerApiLoaded = false;
            var oauthToken;

            // Use the API Loader script to load google.picker and gapi.auth.
            function onApiLoad() {
                gapi.load('auth', {'callback': onAuthApiLoad});
                gapi.load('picker', {'callback': onPickerApiLoad});
            }

            function onAuthApiLoad() {
                window.gapi.auth.authorize(
                    {
                        'client_id': clientId,
                        'scope': scope,
                        'immediate': false
                    },
                    handleAuthResult);
            }

            function onPickerApiLoad() {
                pickerApiLoaded = true;
                createPicker();
            }

            function handleAuthResult(authResult) {
                if (authResult && !authResult.error) {
                    oauthToken = authResult.access_token;
                    createPicker();
                }
            }

            // Create and render a Picker object for picking user Photos.
            function createPicker() {
                if (pickerApiLoaded && oauthToken) {
                    var picker = new google.picker.PickerBuilder().
                    addView(google.picker.ViewId.PHOTOS).
                    setOAuthToken(oauthToken).
                    setDeveloperKey(googleDeveloperKey).
                    setCallback(pickerCallback).
                    build();
                    picker.setVisible(true);
                }
            }

            // A simple callback implementation.
            function pickerCallback(data) {
                var url = 'nothing';
                if (data[google.picker.Response.ACTION] == google.picker.Action.PICKED) {
                    var doc = data[google.picker.Response.DOCUMENTS][0];
                    url = doc[google.picker.Document.URL];
                }
                var message = 'You picked: ' + url;
                this.notifyDesktop(message);
            }
        }
    });

    var App = new AppView;
});
