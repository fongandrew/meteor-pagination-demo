Posts = new Meteor.Collection('posts');

CONSTANTS = {
  defaultLimit: 20,
  maxLimit: 50
};


PostSvc = {
  // Returns cursor for a "page"
  page: function(query) {
    check(query, {
      rank: Number,
      id: String,
      direction: Match.OneOf("start", "next", "back"),
      limit: Match.Where(function(limit) {
        return (typeof(limit) === 'number' 
                && limit > 0
                && limit <= CONSTANTS.maxLimit);
      })
    });

    if (query.direction !== "back") {
      return Posts.find({
        $or: [{rank: {$gt: query.rank}},
              {$and: [{rank: query.rank},
                      {_id: {$gt: query.id}}]
              }]
      }, {
        sort: [['rank', 'asc'], ['_id', 'asc']],
        limit: query.limit + 1 // +1 so we can see if there's more to get
      });
    }

    else {
      return Posts.find({
        $or: [{rank: {$lt: query.rank}},
              {$and: [{rank: query.rank},
                      {_id: {$lt: query.id}}]
              }]
      }, {
        sort: [['rank', 'desc'], ['_id', 'desc']],
        limit: query.limit + 1 // +1 so we can see if there's more to get
      });
    }
  }
}


function getParams(query) {
  return {
    rank: parseInt(query.rank) || 0,
    id: query.id || "",
    direction: query.direction || "start",
    limit: parseInt(query.limit) || CONSTANTS.defaultLimit
  };
} 

Router.route('/', {
  name: 'posts',
  layoutTemplate: 'layout',
  loadingTemplate: 'loading',

  waitOn: function() {
    var params = getParams(this.params.query);
    return Meteor.subscribe('paginatedPosts', params);
  },

  data: function() {
    var params = getParams(this.params.query);
    this.state.set('limit', params.limit);
    this.state.set('direction', params.direction);

    return {
      postsCursor: PostSvc.page(params)
    };
  }
});



/////////////////

if (Meteor.isServer) {
  Meteor.startup(function () {
    if (Posts.find().count() === 0) {
      // Initialize with large-ish number posts
      _.times(300, function(n) {
        Posts.insert({rank: n});
      });

      Posts._ensureIndex([["rank", 1], ["_id", 1]]);
      Posts._ensureIndex([["rank", -1], ["_id", -1]]);
    }
  });

  Meteor.publish('paginatedPosts', function(query) {
    return PostSvc.page(query);
  });
}


//////////////

if (Meteor.isClient) {
  Template.posts.created = function() {
    this.backMark = new ReactiveVar({});
    this.nextMark = new ReactiveVar({});
    this.postCount = new ReactiveVar(0);
  };

  Template.posts.helpers({
    posts: function () {
      var fetchedPosts = this.postsCursor.fetch();
      var postCount = fetchedPosts.length;

      // Cursor may fetch slightly more than limit, so cap
      var limit = Router.current().state.get('limit');
      fetchedPosts = fetchedPosts.slice(0, limit);

      // If direction is 'back', the posts returned are in reverse order
      var direction = Router.current().state.get('direction');
      if (direction === 'back')
        fetchedPosts.reverse();

      // Set reactive variables for other helpers
      var instance = Template.instance();
      instance.backMark.set(fetchedPosts[0]); 
      instance.nextMark.set(fetchedPosts[limit - 1]);
      instance.postCount.set(postCount);

      return fetchedPosts;
    },

    backParams: function() {
      var backMark = Template.instance().backMark.get();
      if (backMark) {
        var limit = Router.current().state.get('limit');
        return jQuery.param({
          direction: 'back',
          rank: backMark.rank,
          id: backMark._id,
          limit: limit
        });
      }  
    },

    nextParams: function() {
      var nextMark = Template.instance().nextMark.get();
      if (nextMark) {
        var limit = Router.current().state.get('limit');
        return jQuery.param({
          direction: 'next',
          rank: nextMark.rank,
          id: nextMark._id,
          limit: limit
        });
      }
    },

    hasBack: function() {
      var direction = Router.current().state.get('direction');
      if (direction === 'start')
        return false;
      if (direction === 'next')
        return true;
      var postCount = Template.instance().postCount.get();
      var limit = Router.current().state.get('limit');
      return postCount > limit; // > rather than >= because we actually
                                // requested limit+1
    },

    hasNext: function() {
      if (Router.current().state.get('direction') === 'back')
        return true;
      var direction = Router.current().state.get('direction');
      var postCount = Template.instance().postCount.get();
      var limit = Router.current().state.get('limit');
      return postCount > limit; // > rather than >= because we actually
                                // requested limit+1
    }
  });

  Template.newPost.events({
    'submit': function(e) {
      e.preventDefault();
      var rankInput = $(e.target).find('[name=rank]');
      Posts.insert({rank: parseInt(rankInput.val())});
      rankInput.val(""); // Clear box
    }
  });
}