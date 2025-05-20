const mongoose = require("mongoose");
const moment = require('moment');

const JobcomponentSchema = new mongoose.Schema(
    {
        project: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Projects',
            index: true
        },
        jobmanager: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Users',
            index: true
        },
        budgettype: {
            type: String
        },
        estimatedbudget: {
            type: Number,
            index: true
        },
        jobcomponent: {
            type: String
        },
        status: {
            type: String,
            default: "On-going"
        },
        comments: {
            type: String
        },
        adminnotes: {
            type: String
        },
        isVariation: {
            type: Boolean
        },
        members: [{
            employee: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Users',
                index: true,
                required: false
            },
            role: {
                type: String
            },
            notes: {
                type: String
            },
            dates: [
                {
                  date: {
                    type: Date,
                    index: true
                  },
                  hours: {
                    type: Number,
                    index: true
                  },
                  status: [
                        {
                            type: String,
                            index: true
                        }
                    ]
                },
            ]
        }]
    },
    {
        timestamps: true
    }
)

JobcomponentSchema.pre('save', function(next) {
  this.members.forEach(member => {
    member.dates = member.dates.filter(dateEntry => {
      const day = moment(dateEntry.date).day();
      return day !== 0 && day !== 6;
    });
  });
  next();
});
const Jobcomponents = mongoose.model("Jobcomponents", JobcomponentSchema)
module.exports = Jobcomponents