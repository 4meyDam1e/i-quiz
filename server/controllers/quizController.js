import asyncHandler from "express-async-handler";
import formatMessage from "../utils/utils.js";
import Quiz from "../models/Quiz.js";
import MCQ from "../models/MCQ.js";
import MSQ from "../models/MSQ.js";
import CLO from "../models/CLO.js";
import OEQ from "../models/OEQ.js";
import User from "../models/User.js";
import Course from "../models/Course.js";
import QuizResponse from "../models/QuizResponse.js";
import { isValidObjectId } from "mongoose";
import sendQuizInvitation from "../utils/quizInvitationUtils.js";
import sendGradedQuizEmail from "../utils/gradedQuizUtils.js";

//@route  POST api/quizzes
//@desc   Allow instructor to create a quiz
//@access Private
const createQuiz = asyncHandler(async (req, res) => {
  const { quizName, startTime, endTime, isDraft, course, questions } = req.body;

  //Check if valid user
  let instructor;
  try {
    instructor = await User.findOne({ email: req.session.email });
    if (!instructor) {
      return res.status(400).json(formatMessage(false, "Invalid user"));
    } else if (instructor.type !== "instructor") {
      return res.status(400).json(formatMessage(false, "Invalid user type"));
    }
  } catch (error) {
    return res
      .status(400)
      .json(formatMessage(false, "Mongoose error finding user", null, error));
  }

  //Verify all fields exist
  if (
    !quizName ||
    isDraft === undefined ||
    ((!startTime || !endTime) && !isDraft) ||
    !course ||
    !questions
  ) {
    return res.status(400).json(formatMessage(false, "Missing fields"));
  }

  //Verify valid course
  let courseToAddTo;
  try {
    courseToAddTo = await Course.findById(course);
    if (!courseToAddTo) {
      return res.status(400).json(formatMessage(false, "Invalid course id"));
    }
    if (!courseToAddTo.instructor.equals(instructor._id)) {
      return res
        .status(400)
        .json(formatMessage(false, "No access to the course"));
    }
  } catch (error) {
    return res
      .status(400)
      .json(formatMessage(false, "Mongoose error finding course", null, error));
  }

  let startTimeConverted, endTimeConverted;
  if (!isDraft) {
    //Convert startTime and endTime to Date objects
    startTimeConverted = new Date(startTime);
    endTimeConverted = new Date(endTime);

    //Verify startTime and endTime are valid dates and startTime is before endTime
    if (
      isNaN(startTimeConverted) ||
      isNaN(endTimeConverted) ||
      startTime >= endTime
    ) {
      return res
        .status(400)
        .json(formatMessage(false, "Invalid start and/or end time"));
    }
  }

  //Check if there is a pre-existing quiz
  try {
    const existingQuiz = await Quiz.findOne({
      $and: [{ quizName: quizName }, { course: course }],
    });
    if (existingQuiz) {
      return res
        .status(400)
        .json(
          formatMessage(
            false,
            `Quiz named "${quizName}" already exists in ${courseToAddTo.courseCode} ${courseToAddTo.courseSemester}`
          )
        );
    }
  } catch (error) {
    return res
      .status(400)
      .json(
        formatMessage(
          false,
          "Mongoose error finding existing quiz",
          null,
          error
        )
      );
  }

  //Quiz questions
  const quizQuestions = [];

  //Create questions
  for (let i = 0; i < questions.length; i++) {
    let createdQuestion;
    try {
      switch (questions[i].type) {
        case "MCQ":
          const validMCQChoices = questions[i].choices.every(
            (choice) => choice.id && choice.content
          );
          if (!validMCQChoices) {
            return res
              .status(400)
              .json(formatMessage(false, "Invalid choices in MCQ question"));
          }
          const validMCQAnswer = questions[i].answers.length === 1;
          if (!validMCQAnswer) {
            return res
              .status(400)
              .json(
                formatMessage(false, "Please provide a correct option for MCQ")
              );
          }
          createdQuestion = await MCQ.create(questions[i]);
          break;
        case "MSQ":
          const validMSQChoices = questions[i].choices.every(
            (choice) => choice.id && choice.content
          );
          if (!validMSQChoices) {
            return res
              .status(400)
              .json(formatMessage(false, "Invalid choices in MSQ question"));
          }
          const validMSQAnswer = questions[i].answers.length > 0;
          if (!validMSQAnswer) {
            return res
              .status(400)
              .json(
                formatMessage(false, "Please provide correct option(s) for MSQ")
              );
          }
          createdQuestion = await MSQ.create(questions[i]);
          break;
        case "CLO":
          createdQuestion = await CLO.create(questions[i]);
          break;
        case "OEQ":
          createdQuestion = await OEQ.create(questions[i]);
          break;
        default:
          return res
            .status(400)
            .json(
              formatMessage(false, `Invalid question type ${questions[i].type}`)
            );
      }
    } catch (error) {
      return res
        .status(400)
        .json(
          formatMessage(false, "Mongoose error creating question", null, error)
        );
    }

    if (!createdQuestion) {
      return res
        .status(400)
        .json(formatMessage(false, "Question creation failed"));
    } else {
      quizQuestions.push({
        question: createdQuestion._id,
        type: questions[i].type,
        maxScore:
          questions[i].maxScore && questions[i].maxScore > 0
            ? questions[i].maxScore
            : 1,
      });
    }
  }

  //Create quiz
  const quiz = await Quiz.create({
    quizName: quizName,
    isDraft: isDraft,
    startTime: startTimeConverted ?? undefined,
    endTime: endTimeConverted ?? undefined,
    course: course,
    questions: quizQuestions,
  });
  if (quiz) {
    courseToAddTo.quizzes.push(quiz._id);
    await courseToAddTo.save();
    const emails = await getCourseStudentEmails(
      courseToAddTo._id,
      instructor.email
    );

    if (!isDraft) {
      await sendQuizInvitation(courseToAddTo, emails, quiz);
    }

    return res
      .status(201)
      .json(formatMessage(true, "Quiz created successfully", quiz));
  } else {
    return res.status(400).json(formatMessage(false, "Quiz creation failed"));
  }
});

//@route  GET api/quizzes/:quizId
//@desc   Allow instructor get a specific quiz
//@access Private
const getQuiz = asyncHandler(async (req, res) => {
  //Check if valid user
  let instructor;
  try {
    instructor = await User.findOne({ email: req.session.email });
    if (!instructor) {
      return res.status(400).json(formatMessage(false, "Invalid user"));
    } else if (instructor.type !== "instructor") {
      return res.status(400).json(formatMessage(false, "Invalid user type"));
    }
  } catch (error) {
    return res
      .status(400)
      .json(formatMessage(false, "Mongoose error finding user", null, error));
  }

  let quiz;
  try {
    quiz = await Quiz.findById(req.params.quizId);
    if (!quiz) {
      return res.status(400).json(formatMessage(false, "Invalid quiz id"));
    }
  } catch (error) {
    return res
      .status(400)
      .json(formatMessage(false, "Mongoose error finding quiz", null, error));
  }

  let course;
  try {
    course = await Course.findById(quiz.course);
    if (!course) {
      return res
        .status(400)
        .json(formatMessage(false, "Invalid course id in quiz"));
    }
  } catch (error) {
    return res
      .status(400)
      .json(
        formatMessage(false, "Mongoose error finding quiz course", null, error)
      );
  }

  //Check if instructor teaches course
  if (course.instructor.toString() !== instructor._id.toString()) {
    return res
      .status(403)
      .json(formatMessage(false, "Instructor does not teach course"));
  }

  return res.status(200).json(formatMessage(true, "Quiz found", quiz));
});

//@route  GET api/quizzes/stats/:quizId
//@desc   Allow instructor get a specific quiz
//@access Private
const getQuizStats = asyncHandler(async (req, res) => {
  //Check if valid user
  let instructor;
  try {
    instructor = await User.findOne({ email: req.session.email });
    if (!instructor) {
      return res.status(400).json(formatMessage(false, "Invalid user"));
    } else if (instructor.type !== "instructor") {
      return res.status(400).json(formatMessage(false, "Invalid user type"));
    }
  } catch (error) {
    return res
      .status(400)
      .json(formatMessage(false, "Mongoose error finding user", null, error));
  }

  let quiz;
  try {
    quiz = await Quiz.findById(req.params.quizId);
    if (!quiz) {
      return res.status(400).json(formatMessage(false, "Invalid quiz id"));
    }
  } catch (error) {
    return res
      .status(400)
      .json(formatMessage(false, "Mongoose error finding quiz", null, error));
  }

  let course;
  try {
    course = await Course.findById(quiz.course);
    if (!course) {
      return res
        .status(400)
        .json(formatMessage(false, "Invalid course id in quiz"));
    }
  } catch (error) {
    return res
      .status(400)
      .json(
        formatMessage(false, "Mongoose error finding quiz course", null, error)
      );
  }

  //Check if instructor teaches course
  if (course.instructor.toString() !== instructor._id.toString()) {
    return res
      .status(403)
      .json(formatMessage(false, "Instructor does not teach course"));
  }

  const allResponses = await QuizResponse.find({ quiz: req.params.quizId });
  const markedResponses = allResponses.filter((i) => i.graded === "fully");
  return res.status(200).json(
    formatMessage(true, "Quiz found", {
      responseCount: allResponses.length,
      markedCount: markedResponses.length,
    })
  );
});

//@route  GET api/quizzes/:quizId/questions
//@desc   Allow any authenticated user to get any full quiz with questions
//@access Private
const getQuizObject = asyncHandler(async (req, res) => {
  let quiz;
  try {
    quiz = await Quiz.findById(req.params.quizId);
    if (!quiz) {
      return res.status(400).json(formatMessage(false, "Invalid quiz id"));
    }
  } catch (error) {
    return res
      .status(400)
      .json(formatMessage(false, "Mongoose error finding quiz", null, error));
  }

  //Get questions for quiz
  const formattedQuesions = [];
  for (let i = 0; i < quiz.questions.length; i++) {
    try {
      let question;
      switch (quiz.questions[i].type) {
        case "MCQ":
          question = await MCQ.findById(quiz.questions[i].question);
          break;
        case "MSQ":
          question = await MSQ.findById(quiz.questions[i].question);
          break;
        case "CLO":
          question = await CLO.findById(quiz.questions[i].question);
          break;
        case "OEQ":
          question = await OEQ.findById(quiz.questions[i].question);
          break;
        default:
          return res
            .status(400)
            .json(formatMessage(false, "Invalid question type"));
      }
      if (!question) {
        return res
          .status(400)
          .json(formatMessage(false, "Invalid question id"));
      }
      formattedQuesions.push({
        ...question.toObject(),
        type: quiz.questions[i].type,
      });
    } catch (error) {
      return res
        .status(400)
        .json(
          formatMessage(false, "Mongoose error finding question", null, error)
        );
    }
  }

  let course;
  try {
    course = await Course.findById(quiz.course);
    if (!course) {
      return res
        .status(400)
        .json(formatMessage(false, "Invalid course id in quiz"));
    }
  } catch (error) {
    return res
      .status(400)
      .json(
        formatMessage(false, "Mongoose error finding quiz course", null, error)
      );
  }

  return res.status(200).json(
    formatMessage(true, "Quiz found", {
      quizName: quiz.quizName,
      isDraft: quiz.isDraft,
      courseCode: course.courseCode,
      courseId: course._id,
      startTime: quiz.startTime,
      endTime: quiz.endTime,
      questions: formattedQuesions,
      isGradeReleased: quiz.isGradeReleased,
    })
  );
});

//@route  GET api/quizzes/:status
//@desc   Allow users to get draft, active, or upcoming quizzes for their enrolled or instructed courses
//@access Private
const getMyQuizzes = asyncHandler(async (req, res) => {
  const { status } = req.params;

  if (
    status !== "draft" &&
    status !== "active" &&
    status !== "upcoming" &&
    status !== "past"
  ) {
    return res.status(400).json(formatMessage(false, "Invalid parameter"));
  }

  //Check if valid user
  let user;
  try {
    user = await User.findOne({ email: req.session.email });
    if (!user) {
      return res.status(400).json(formatMessage(false, "Invalid user"));
    }
  } catch (error) {
    return res
      .status(400)
      .json(formatMessage(false, "Mongoose error finding user"));
  }

  let formattedQuizzes = [];

  //Get quizzes for every course
  for (let j = 0; j < user.courses.length; j++) {
    const accentColor = user.courses[j].accentColor;
    let course;
    try {
      course = await Course.findById(user.courses[j].courseId);
      if (!course) {
        return res
          .status(400)
          .json(formatMessage(false, "Invalid course id in quiz"));
      }
    } catch (error) {
      return res
        .status(400)
        .json(
          formatMessage(
            false,
            "Mongoose error finding quiz course",
            null,
            error
          )
        );
    }

    for (let i = 0; i < course.quizzes.length; i++) {
      try {
        const quiz = await Quiz.findById(course.quizzes[i]);
        if (!quiz) {
          return res.status(400).json(formatMessage(false, "Invalid quiz id"));
        }
        const currentDateTime = new Date();
        let flag;
        switch (status) {
          case "draft":
            flag = quiz.isDraft && user.type === "instructor";
            break;
          case "active":
            flag =
              !quiz.isDraft &&
              currentDateTime >= quiz.startTime &&
              currentDateTime <= quiz.endTime;
            break;
          case "upcoming":
            flag = !quiz.isDraft && currentDateTime < quiz.startTime; // assume startTime < endTime
            break;
          case "past":
            flag = !quiz.isDraft && currentDateTime > quiz.endTime; // assume endTime > startTime
            break;
          default:
            break;
        }

        if (flag) {
          let quizResponse;
          if (user.type === "student") {
            quizResponse = await QuizResponse.findOne({
              quiz: quiz._id,
              student: user._id,
            });
          }
          formattedQuizzes.push({
            quizId: quiz._id,
            quizName: quiz.quizName,
            courseCode: course.courseCode,
            courseId: course._id,
            accentColor: accentColor,
            startTime: quiz.startTime,
            endTime: quiz.endTime,
            isDraft: quiz.isDraft,
            responseStatus: quizResponse ? quizResponse.status : undefined,
            isGradeReleased: quiz.isGradeReleased,
          });
        }
      } catch (error) {
        return res
          .status(400)
          .json(
            formatMessage(
              false,
              "Mongoose error finding quizzes for course",
              null,
              error
            )
          );
      }
    }
  }

  return res
    .status(200)
    .json(
      formatMessage(
        true,
        `${status} quizzes fetched for the user`,
        formattedQuizzes
      )
    );
});

//@route  GET api/quizzes/course/instructed/:courseId
//@desc   Allow instructor get all quizzes for a course they teach
//@access Private
const getQuizzesForInstructedCourse = asyncHandler(async (req, res) => {
  //Check if valid user
  let instructor;
  try {
    instructor = await User.findOne({ email: req.session.email });
    if (!instructor) {
      return res.status(400).json(formatMessage(false, "Invalid user"));
    } else if (instructor.type !== "instructor") {
      return res.status(400).json(formatMessage(false, "Invalid user type"));
    }
  } catch (error) {
    return res
      .status(400)
      .json(formatMessage(false, "Mongoose error finding user", null, error));
  }

  //Check if valid course
  let course;
  try {
    course = await Course.findById(req.params.courseId);
    if (!course) {
      return res.status(400).json(formatMessage(false, "Invalid course id"));
    }
  } catch (error) {
    return res
      .status(400)
      .json(formatMessage(false, "Mongoose error finding course", null, error));
  }

  //Check if instructor teaches course
  if (course.instructor.toString() !== instructor._id.toString()) {
    return res
      .status(403)
      .json(formatMessage(false, "Instructor does not teach course"));
  }

  //Get quizzes for course
  try {
    const quizzes = await Quiz.find({ course: req.params.courseId });
    if (!quizzes) {
      return res.status(400).json(formatMessage(false, "Invalid course"));
    }
    return res.status(200).json(
      formatMessage(
        true,
        "Quizzes found",
        quizzes.map((quiz) => {
          return {
            quizId: quiz._id,
            quizName: quiz.quizName,
            isDraft: quiz.isDraft,
            startTime: quiz.startTime,
            endTime: quiz.endTime,
          };
        })
      )
    );
  } catch (error) {
    return res
      .status(400)
      .json(
        formatMessage(
          false,
          "Mongoose error finding quizzes for course",
          null,
          error
        )
      );
  }
});

//@route  GET api/quizzes/course/enrolled/:courseId
//@desc   Allow student to get all quizzes for a course they are enrolled in
//@access Private
const getQuizzesForEnrolledCourse = asyncHandler(async (req, res) => {
  //Check if valid user
  let student;
  try {
    student = await User.findOne({ email: req.session.email });
    if (!student) {
      return res.status(400).json(formatMessage(false, "Invalid user"));
    } else if (student.type !== "student") {
      return res.status(400).json(formatMessage(false, "Invalid user type"));
    }
  } catch (error) {
    return res
      .status(400)
      .json(formatMessage(false, "Mongoose error finding user", null, error));
  }

  //Check if valid course
  let course;
  try {
    course = await Course.findById(req.params.courseId);
    if (!course) {
      return res.status(400).json(formatMessage(false, "Invalid course id"));
    }
  } catch (error) {
    return res
      .status(400)
      .json(formatMessage(false, "Mongoose error finding course", null, error));
  }

  //Check if student is enrolled in course
  if (
    !student.courses.some(
      (course) => course.courseId.toString() === req.params.courseId.toString()
    )
  ) {
    return res
      .status(403)
      .json(formatMessage(false, "Student not enrolled in course"));
  }

  const formattedQuizzes = [];
  //Get quizzes for course
  for (let i = 0; i < course.quizzes.length; i++) {
    try {
      const quiz = await Quiz.findById(course.quizzes[i]);
      if (!quiz) {
        return res.status(400).json(formatMessage(false, "Invalid quiz id"));
      }
      if (!quiz.isDraft) {
        const currentDateTime = new Date();
        let currentQuizStatus = "";
        if (currentDateTime < quiz.startTime) {
          currentQuizStatus = "Upcoming";
        } else if (currentDateTime > quiz.endTime) {
          currentQuizStatus = "Past";
        } else {
          currentQuizStatus = "Active";
        }

        const quizResponse = await QuizResponse.findOne({
          quiz: quiz._id,
          student: student._id,
        });

        formattedQuizzes.push({
          quizId: quiz._id,
          quizName: quiz.quizName,
          status: currentQuizStatus,
          responseStatus: quizResponse ? quizResponse.status : "",
          isGradeReleased: quiz.isGradeReleased,
          startTime: quiz.startTime,
          endTime: quiz.endTime,
        });
      }
    } catch (error) {
      return res
        .status(400)
        .json(
          formatMessage(
            false,
            "Mongoose error finding quizzes for course",
            null,
            error
          )
        );
    }
  }

  return res
    .status(200)
    .json(formatMessage(true, "Quizzes found", formattedQuizzes));
});

//@route  PATCH api/quizzes
//@desc   Allow instructor to update a quiz (not all fields)
//@access Private
const basicUpdateQuiz = asyncHandler(async (req, res) => {
  const { quizId, newQuizName, newStartTime, newEndTime } = req.body;

  //Check if valid user
  let instructor;
  try {
    instructor = await User.findOne({ email: req.session.email });
    if (!instructor) {
      return res.status(400).json(formatMessage(false, "Invalid user"));
    } else if (instructor.type !== "instructor") {
      return res.status(400).json(formatMessage(false, "Invalid user type"));
    }
  } catch (error) {
    return res
      .status(400)
      .json(formatMessage(false, "Mongoose error finding user", null, error));
  }

  //Verify all fields exist
  if (!quizId || !newQuizName || !newStartTime || !newEndTime) {
    return res.status(400).json(formatMessage(false, "Missing fields"));
  }

  //Convert startTime and endTime to Date objects
  const startTimeConverted = new Date(newStartTime);
  const endTimeConverted = new Date(newEndTime);

  //Verify startTime and endTime are valid dates and startTime is before endTime
  if (
    isNaN(startTimeConverted) ||
    isNaN(endTimeConverted) ||
    newStartTime >= newEndTime
  ) {
    return res
      .status(400)
      .json(formatMessage(false, "Invalid start and/or end time"));
  }

  let quiz;
  try {
    quiz = await Quiz.findById(quizId);
    if (!quiz) {
      return res.status(400).json(formatMessage(false, "Invalid quiz id"));
    }
  } catch (error) {
    return res
      .status(400)
      .json(formatMessage(false, "Mongoose error finding quiz", null, error));
  }

  //Check if there is a pre-existing quiz with new name
  try {
    const existingQuiz = await Quiz.findOne({
      $and: [{ quizName: newQuizName }, { course: quiz.course }],
    });
    if (existingQuiz) {
      return res.status(400).json(formatMessage(false, "Quiz name taken"));
    }
  } catch (error) {
    return res
      .status(400)
      .json(
        formatMessage(
          false,
          "Mongoose error finding existing quiz",
          null,
          error
        )
      );
  }

  let course;
  try {
    course = await Course.findById(quiz.course);
    if (!course) {
      return res
        .status(400)
        .json(formatMessage(false, "Invalid course id in quiz"));
    }
  } catch (error) {
    return res
      .status(400)
      .json(
        formatMessage(false, "Mongoose error finding quiz course", null, error)
      );
  }

  //Check if instructor teaches course
  if (course.instructor.toString() !== instructor._id.toString()) {
    return res
      .status(403)
      .json(formatMessage(false, "Instructor does not teach course"));
  }

  //Update quiz
  quiz.quizName = newQuizName;
  quiz.startTime = startTimeConverted;
  quiz.endTime = endTimeConverted;
  await quiz.save();

  return res.status(200).json(formatMessage(true, "Quiz updated successfully"));
});

//@route  POST api/quizzes/update
//@desc   Allow instructor to update a quiz
//@access Private
const updateQuiz = asyncHandler(async (req, res) => {
  const { quizId, quizName, course, questions } = req.body;

  //Verify all fields exist
  if (!quizName || !course || !questions) {
    return res.status(400).json(formatMessage(false, "Missing fields"));
  }

  //Check if valid user
  let instructor;
  try {
    instructor = await User.findOne({ email: req.session.email });
    if (!instructor) {
      return res.status(400).json(formatMessage(false, "Invalid user"));
    } else if (instructor.type !== "instructor") {
      return res.status(400).json(formatMessage(false, "Invalid user type"));
    }
  } catch (error) {
    return res
      .status(400)
      .json(formatMessage(false, "Mongoose error finding user", null, error));
  }

  //Verify valid course
  let courseToAddTo;
  try {
    courseToAddTo = await Course.findById(course);
    if (!courseToAddTo) {
      return res.status(400).json(formatMessage(false, "Invalid course id"));
    }
    if (!courseToAddTo.instructor.equals(instructor._id)) {
      return res.status(400).json(formatMessage(false, "Access denied"));
    }
  } catch (error) {
    return res
      .status(400)
      .json(formatMessage(false, "Mongoose error finding course", null, error));
  }

  // verify quiz id
  const existingQuiz = await Quiz.findById(quizId);
  if (!existingQuiz) {
    return res.status(400).json(formatMessage(false, "Invalid quiz id"));
  }

  const quizQuestions = await Promise.all(
    questions.map(async (question) => {
      if (question._id && isValidObjectId(question._id)) {
        const existingQuestion = await Promise.all([
          MCQ.findById(question._id),
          MSQ.findById(question._id),
          OEQ.findById(question._id),
          CLO.findById(question._id),
        ]);
        if (existingQuestion.filter((q) => q).length === 1) {
          await editQuestion(question, res);
          return {
            question: question._id,
            type: question.type,
          };
        }
      }
      const createdQuestion = await createQuestion(question, res);
      if (!createdQuestion) {
        return res
          .status(400)
          .json(formatMessage(false, "Question creation failed"));
      } else {
        return { question: createdQuestion._id, type: question.type };
      }
    })
  );

  existingQuiz.quizName = quizName;
  existingQuiz.course = course;
  existingQuiz.questions = quizQuestions;

  await existingQuiz.save();
  return res.status(200).json(formatMessage(true, "Quiz updated successfully"));
});

//@route  POST api/quizzes/question
//@desc   Allow instructor to add (a) question(s) to a quiz
//@access Private
const addQuizQuestions = asyncHandler(async (req, res) => {
  const { quizId, questions } = req.body;

  //Check if valid user
  let instructor;
  try {
    instructor = await User.findOne({ email: req.session.email });
    if (!instructor) {
      return res.status(400).json(formatMessage(false, "Invalid user"));
    } else if (instructor.type !== "instructor") {
      return res.status(400).json(formatMessage(false, "Invalid user type"));
    }
  } catch (error) {
    return res
      .status(400)
      .json(formatMessage(false, "Mongoose error finding user", null, error));
  }

  //Verify all fields exist
  if (!quizId || !questions) {
    return res.status(400).json(formatMessage(false, "Missing fields"));
  }

  let quiz;
  try {
    quiz = await Quiz.findById(quizId);
    if (!quiz) {
      return res.status(400).json(formatMessage(false, "Invalid quiz id"));
    }
  } catch (error) {
    return res
      .status(400)
      .json(formatMessage(false, "Mongoose error finding quiz", null, error));
  }

  let course;
  try {
    course = await Course.findById(quiz.course);
    if (!course) {
      return res
        .status(400)
        .json(formatMessage(false, "Invalid course id in quiz"));
    }
  } catch (error) {
    return res
      .status(400)
      .json(
        formatMessage(false, "Mongoose error finding quiz course", null, error)
      );
  }

  //Check if instructor teaches course
  if (course.instructor.toString() !== instructor._id.toString()) {
    return res
      .status(403)
      .json(formatMessage(false, "Instructor does not teach course"));
  }

  //Create questions
  for (let i = 0; i < questions.length; i++) {
    let createdQuestion;
    try {
      switch (questions[i].type) {
        case "MCQ":
          const validMCQChoices = questions[i].choices.every(
            (choice) => choice.id && choice.content
          );
          if (!validMCQChoices) {
            return res
              .status(400)
              .json(formatMessage(false, "Invalid choices in MCQ question"));
          }
          createdQuestion = await MCQ.create(questions[i]);
          break;
        case "MSQ":
          const validMSQChoices = questions[i].choices.every(
            (choice) => choice.id && choice.content
          );
          if (!validMSQChoices) {
            return res
              .status(400)
              .json(formatMessage(false, "Invalid choices in MSQ question"));
          }
          createdQuestion = await MSQ.create(questions[i]);
          break;
        case "CLO":
          createdQuestion = await CLO.create(questions[i]);
          break;
        case "OEQ":
          createdQuestion = await OEQ.create(questions[i]);
          break;
        default:
          return res
            .status(400)
            .json(formatMessage(false, "Invalid question type"));
      }
    } catch (error) {
      return res
        .status(400)
        .json(
          formatMessage(false, "Mongoose error creating question", null, error)
        );
    }

    if (!createdQuestion) {
      return res
        .status(400)
        .json(formatMessage(false, "Question creation failed"));
    } else {
      try {
        quiz.questions.push({
          question: createdQuestion._id,
          type: questions[i].type,
        });
      } catch (error) {
        return res.status(400).json(formatMessage(false, error.message));
      }
    }
  }
  await quiz.save();
  return res
    .status(200)
    .json(formatMessage(true, "Questions added successfully"));
});

//@route  PATCH api/quizzes/question
//@desc   Allow instructor to edit or remove a question from a quiz
//@access Private
const updateQuizQuestion = asyncHandler(async (req, res) => {
  const { quizId, action, question } = req.body;

  //Check if valid user
  let instructor;
  try {
    instructor = await User.findOne({ email: req.session.email });
    if (!instructor) {
      return res.status(400).json(formatMessage(false, "Invalid user"));
    } else if (instructor.type !== "instructor") {
      return res.status(400).json(formatMessage(false, "Invalid user type"));
    }
  } catch (error) {
    return res
      .status(400)
      .json(formatMessage(false, "Mongoose error finding user", null, error));
  }

  //Verify all fields exist
  if (
    !quizId ||
    !question ||
    !action ||
    (action !== "edit" && action !== "remove")
  ) {
    return res.status(400).json(formatMessage(false, "Missing/invalid fields"));
  }

  //Verify valid question
  if (action === "edit") {
    if (!question._id || !question.type) {
      return res
        .status(400)
        .json(formatMessage(false, "Missing fields in question"));
    }
  } else {
    //assume action === "remove", since we checked that earlier
    if (!question._id || !question.type) {
      return res
        .status(400)
        .json(formatMessage(false, "Missing fields in question"));
    }
  }

  let quiz;
  try {
    quiz = await Quiz.findById(quizId);
    if (!quiz) {
      return res.status(400).json(formatMessage(false, "Invalid quiz id"));
    }
  } catch (error) {
    return res
      .status(400)
      .json(formatMessage(false, "Mongoose error finding quiz", null, error));
  }

  let course;
  try {
    course = await Course.findById(quiz.course);
    if (!course) {
      return res
        .status(400)
        .json(formatMessage(false, "Invalid course id in quiz"));
    }
  } catch (error) {
    return res
      .status(400)
      .json(
        formatMessage(false, "Mongoose error finding quiz course", null, error)
      );
  }

  //Check if instructor teaches course
  if (course.instructor.toString() !== instructor._id.toString()) {
    return res
      .status(403)
      .json(formatMessage(false, "Instructor does not teach course"));
  }

  //Check if question exists in quiz
  const questionIndex = quiz.questions.findIndex(
    (currQuestion) =>
      currQuestion.toString() === question._id &&
      currQuestion.type === question.type
  );
  if (questionIndex === -1) {
    return res
      .status(400)
      .json(formatMessage(false, "Question not found in quiz"));
  }

  //Edit or remove question
  if (action === "remove") {
    try {
      switch (question.type) {
        case "MCQ":
          await MCQ.findByIdAndDelete(question._id);
          break;
        case "MSQ":
          await MSQ.findByIdAndDelete(question._id);
          break;
        case "CLO":
          await CLO.findByIdAndDelete(question._id);
          break;
        case "OEQ":
          await OEQ.findByIdAndDelete(question._id);
          break;
        default:
          return res
            .status(400)
            .json(formatMessage(false, "Invalid question type"));
      }
    } catch (error) {
      return res
        .status(400)
        .json(
          formatMessage(false, "Mongoose error editing question", null, error)
        );
    }
    quiz.questions.splice(questionIndex, 1);
    await quiz.save();
    return res
      .status(200)
      .json(formatMessage(true, "Question removed successfully"));
  } else {
    //assume action === "edit", since we checked that earlier
    try {
      switch (question.type) {
        case "MCQ":
          const validMCQChoices = question.choices.every(
            (choice) => choice.id && choice.content
          );
          if (!validMCQChoices) {
            return res
              .status(400)
              .json(formatMessage(false, "Invalid choices in MCQ question"));
          }
          await MCQ.findByIdAndUpdate(question._id, question);
          break;
        case "MSQ":
          const validMSQChoices = question.choices.every(
            (choice) => choice.id && choice.content
          );
          if (!validMSQChoices) {
            return res
              .status(400)
              .json(formatMessage(false, "Invalid choices in MSQ question"));
          }
          await MSQ.findByIdAndUpdate(question._id, question);
          break;
        case "CLO":
          await CLO.findByIdAndUpdate(question._id, question);
          break;
        case "OEQ":
          await OEQ.findByIdAndUpdate(question._id, question);
          break;
        default:
          return res
            .status(400)
            .json(formatMessage(false, "Invalid question type"));
      }
    } catch (error) {
      return res.status(400).json(formatMessage(false, error.message));
    }
    return res
      .status(200)
      .json(formatMessage(true, "Question edited successfully"));
  }
});

//@route  POST api/quizzes/:quizId/release
//@desc   Allow instructor to release a quiz
//@access Private
const releaseQuiz = asyncHandler(async (req, res) => {
  const { startTime, endTime } = req.body;
  //Verify all fields exist
  if (!startTime || !endTime) {
    return res.status(400).json(formatMessage(false, "Missing fields"));
  }

  //Check if valid user
  let instructor;
  try {
    instructor = await User.findOne({ email: req.session.email });
    if (!instructor) {
      return res.status(400).json(formatMessage(false, "Invalid user"));
    } else if (instructor.type !== "instructor") {
      return res.status(400).json(formatMessage(false, "Invalid user type"));
    }
  } catch (error) {
    return res
      .status(400)
      .json(formatMessage(false, "Mongoose error finding user"));
  }

  let quiz;
  try {
    quiz = await Quiz.findById(req.params.quizId);
    if (!quiz) {
      return res.status(400).json(formatMessage(false, "Invalid quiz id"));
    }
    if (!quiz.isDraft) {
      return res
        .status(400)
        .json(formatMessage(false, "Quiz has already been released"));
    }
  } catch (error) {
    return res
      .status(400)
      .json(formatMessage(false, "Mongoose error finding quiz"));
  }

  const courseObject = await Course.findById(quiz.course);
  if (!courseObject) {
    return res.status(400).json(formatMessage(false, "Invalid courseId"));
  } else if (!courseObject.instructor.equals(instructor._id)) {
    return res.status(400).json(formatMessage(false, "Access denied"));
  }
  const emails = await getCourseStudentEmails(quiz.course, instructor.email);

  //Convert startTime and endTime to Date objects
  const startTimeConverted = new Date(startTime);
  const endTimeConverted = new Date(endTime);

  //Verify startTime and endTime are valid dates and startTime is before endTime
  if (
    isNaN(startTimeConverted) ||
    isNaN(endTimeConverted) ||
    startTime >= endTime
  ) {
    return res
      .status(400)
      .json(formatMessage(false, "Invalid start and/or end time"));
  }

  quiz.isDraft = false;
  quiz.startTime = startTimeConverted;
  quiz.endTime = endTimeConverted;

  await quiz.save();
  await sendQuizInvitation(courseObject, emails, quiz);

  return res
    .status(200)
    .json(formatMessage(true, "Quiz released successfully", quiz));
});

//@route  DELETE api/quizzes/:quizId
//@desc   Allow instructor to update a quiz
//@access Private
const deleteDraftQuiz = asyncHandler(async (req, res) => {
  const { quizId } = req.params;

  //Verify all fields exist
  if (!quizId) {
    return res.status(400).json(formatMessage(false, "Missing parameter"));
  }

  //Check if valid user
  let instructor;
  try {
    instructor = await User.findOne({ email: req.session.email });
    if (!instructor) {
      return res.status(400).json(formatMessage(false, "Invalid user"));
    } else if (instructor.type !== "instructor") {
      return res.status(400).json(formatMessage(false, "Invalid user type"));
    }
  } catch (error) {
    return res
      .status(400)
      .json(formatMessage(false, "Mongoose error finding user", null, error));
  }

  // verify quiz id
  const existingQuiz = await Quiz.findById(quizId);
  if (!existingQuiz) {
    return res.status(400).json(formatMessage(false, "Invalid quiz id"));
  }

  // verify quiz status
  if (!existingQuiz.isDraft) {
    return res
      .status(400)
      .json(formatMessage(false, "Cannot delete released quizzes"));
  }

  // verify access to the quiz
  let course;
  try {
    course = await Course.findById(existingQuiz.course);
    if (!course) {
      return res.status(400).json(formatMessage(false, "Invalid course id"));
    }
    if (!course.instructor.equals(instructor._id)) {
      return res.status(400).json(formatMessage(false, "Access denied"));
    }
  } catch (error) {
    return res
      .status(400)
      .json(formatMessage(false, "Mongoose error finding course", null, error));
  }

  await Quiz.deleteOne({ _id: quizId });
  await Course.updateOne({ _id: course }, { $pull: { quizzes: quizId } });

  return res.status(200).json(formatMessage(true, "Quiz deleted successfully"));
});

//@route  PATCH api/quizzes/:quizId/grades-release
//@desc   Allow instructor to release grades for a quiz
//@access Private
const releaseQuizGrades = asyncHandler(async (req, res) => {
  const { quizId } = req.params;

  let instructor;
  try {
    instructor = await User.findOne({ email: req.session.email });
    if (!instructor) {
      return res.status(400).json(formatMessage(false, "Invalid user"));
    } else if (instructor.type !== "instructor") {
      return res.status(400).json(formatMessage(false, "Invalid user type"));
    }
  } catch (error) {
    return res
      .status(400)
      .json(formatMessage(false, "Mongoose error finding user", null, error));
  }

  //Verify all fields exist
  if (!quizId) {
    return res.status(400).json(formatMessage(false, "Missing fields"));
  }

  let course;
  try {
    const quiz = await Quiz.findById(quizId);
    if (!quiz) {
      return res.status(400).json(formatMessage(false, "Invalid quiz"));
    }
    course = await Course.findById(quiz.course);
    if (!course) {
      return res.status(400).json(formatMessage(false, "Invalid quiz course"));
    } else if (course.instructor.toString() !== instructor._id.toString()) {
      return res
        .status(403)
        .json(formatMessage(false, "Instructor does not instruct course"));
    }

    const currentTime = new Date();
    if (quiz.endTime > currentTime) {
      return res.status(400).json(formatMessage(false, "Quiz is still open"));
    } else if (quiz.isGradeReleased) {
      return res
        .status(400)
        .json(formatMessage(false, "Quiz grades already released"));
    }

    for (let i = 0; i < course.sessions.length; i++) {
      for (let j = 0; j < course.sessions[i].students.length; j++) {
        const quizResponse = await QuizResponse.findOne({
          quiz: quizId,
          student: course.sessions[i].students[j],
        });
        // Only care if we've fully graded responses that have been submitted
        if (
          quizResponse &&
          quizResponse.status === "submitted" &&
          quizResponse.graded !== "fully"
        ) {
          return res
            .status(400)
            .json(
              formatMessage(false, "Not all submitted responses fully graded")
            );
        }
      }
    }
    //Sending grades in email
    let totalMaxScore = 0;
    for (const question of quiz.questions) {
      let findQuestion;
      if (question.type === "MCQ") {
        findQuestion = await MCQ.findById(question.question);
      } else if (question.type === "MSQ") {
        findQuestion = await MSQ.findById(question.question);
      } else if (question.type === "CLO") {
        findQuestion = await CLO.findById(question.question);
      } else {
        findQuestion = await OEQ.findById(question.question);
      }
      totalMaxScore += findQuestion.maxScore;
    }

    const students = await getCourseStudents(course._id, instructor.email);

    for (const student of students) {
      const quizRes = await QuizResponse.findOne({
        quiz: quizId,
        student: student._id,
      });

      let studentScore = 0;
      for (const response of quizRes.questionResponses) {
        studentScore += response.score;
      }

      //Sending graded quiz results
      try {
        await sendGradedQuizEmail(
          course,
          student,
          quiz,
          studentScore,
          totalMaxScore
        );
      } catch (err) {
        console.log("Fail to send graded quiz email to: ", student.email);
        return res
          .status(400)
          .json(formatMessage(false, "Fail to send graded quiz email"));
      }
    }
    quiz.isGradeReleased = true;
    await quiz.save();
    return res
      .status(200)
      .json(formatMessage(true, "Quiz grades released successfully"));
  } catch (error) {
    return res
      .status(400)
      .json(
        formatMessage(false, "Mongoose error releasing grades", null, error)
      );
  }
});

//@route  GET api/quizzes/generate/:quizId
//@desc   Allow instructor to export quiz to pdf
//@access Private
const generateQuizPDF = asyncHandler(async (req, res) => {
  const { quizId } = req.params;

  const instructor = await User.findOne({ email: req.session.email });
  if (!instructor) {
    return res.status(400).json(formatMessage(false, "Invalid user"));
  } else if (instructor.type !== "instructor") {
    return res.status(400).json(formatMessage(false, "Invalid user type"));
  }

  const quiz = await Quiz.findById(quizId);
  if (quiz) {
    const course = await Course.findById(quiz.course);
    if (!course) {
      return res.status(400).json(formatMessage(false, "Fail to get course"));
    }
    if (course.instructor.toString() !== instructor._id.toString()) {
      return res
        .status(400)
        .json(formatMessage(false, "Not the course instructor"));
    }

    const questions = await getQuestions(quiz._id);
    let fileName = `${course.courseName}_${quiz.quizName}.pdf`;

    //Sends pdf back in response
    res.json(
      formatMessage(true, "Success", {
        course: course,
        quiz: quiz,
        questions: questions,
        fileName: fileName,
      })
    );
  } else {
    return res.status(400).json(formatMessage(false, "Fail to get quiz"));
  }
});

/* ----------- HELPER FUNCTIONS ----------- */

/* Edit a question in the database */
async function editQuestion(question, res) {
  try {
    switch (question.type) {
      case "MCQ":
        const validMCQChoices = question.choices.every(
          (choice) => choice.id && choice.content
        );
        if (!validMCQChoices) {
          return res
            .status(400)
            .json(formatMessage(false, "Invalid choices in MCQ question"));
        }
        const validMCQAnswer = question.answers.length === 1;
        if (!validMCQAnswer) {
          return res
            .status(400)
            .json(
              formatMessage(false, "Please provide a correct option for MCQ")
            );
        }
        await MCQ.findByIdAndUpdate(question._id, question);
        break;
      case "MSQ":
        const validMSQChoices = question.choices.every(
          (choice) => choice.id && choice.content
        );
        if (!validMSQChoices) {
          return res
            .status(400)
            .json(formatMessage(false, "Invalid choices in MSQ question"));
        }
        const validMSQAnswer = question.answers.length > 0;
        if (!validMSQAnswer) {
          return res
            .status(400)
            .json(
              formatMessage(false, "Please provide correct option(s) for MSQ")
            );
        }
        await MSQ.findByIdAndUpdate(question._id, question);
        break;
      case "CLO":
        await CLO.findByIdAndUpdate(question._id, question);
        break;
      case "OEQ":
        await OEQ.findByIdAndUpdate(question._id, question);
        break;
      default:
        return res
          .status(400)
          .json(formatMessage(false, "Invalid question type"));
    }
  } catch (error) {
    return res.status(400).json(formatMessage(false, error.message));
  }
}

/* Create a question object in the database and return */
async function createQuestion(question, res) {
  if (question._id && !isValidObjectId(question._id)) {
    delete question._id;
  }
  let createdQuestion;
  try {
    switch (question.type) {
      case "MCQ":
        const validMCQChoices = question.choices.every(
          (choice) => choice.id && choice.content
        );
        if (!validMCQChoices) {
          return res
            .status(400)
            .json(formatMessage(false, "Invalid choices in MCQ question"));
        }
        const validMCQAnswer = question.answers.length === 1;
        if (!validMCQAnswer) {
          return res
            .status(400)
            .json(
              formatMessage(false, "Please provide a correct option for MCQ")
            );
        }
        createdQuestion = await MCQ.create(question);
        break;
      case "MSQ":
        const validMSQChoices = question.choices.every(
          (choice) => choice.id && choice.content
        );
        if (!validMSQChoices) {
          return res
            .status(400)
            .json(formatMessage(false, "Invalid choices in MSQ question"));
        }
        const validMSQAnswer = question.answers.length > 0;
        if (!validMSQAnswer) {
          return res
            .status(400)
            .json(
              formatMessage(false, "Please provide correct option(s) for MSQ")
            );
        }
        createdQuestion = await MSQ.create(question);
        break;
      case "CLO":
        createdQuestion = await CLO.create(question);
        break;
      case "OEQ":
        createdQuestion = await OEQ.create(question);
        break;
      default:
        return res
          .status(400)
          .json(formatMessage(false, "Invalid question type"));
    }
  } catch (error) {
    return res.status(400).json(formatMessage(false, error.message));
  }
  return createdQuestion;
}
/* ----------------------------------------- */

// Get Students Emails
async function getCourseStudentEmails(courseId, instructorEmail) {
  if (!courseId) {
    return [];
  }

  let emails = [];
  const users = await User.find({});

  users.forEach(function (user) {
    for (const course of user.courses) {
      if (
        course.courseId.toString() === courseId.toString() &&
        user.email !== instructorEmail
      ) {
        emails.push(user.email);
      }
    }
  });

  return emails;
}

async function getCourseStudents(courseId, instructorEmail) {
  if (!courseId) {
    return [];
  }

  let students = [];
  const users = await User.find({});

  users.forEach(function (user) {
    for (const course of user.courses) {
      if (
        course.courseId.toString() === courseId.toString() &&
        user.email !== instructorEmail
      ) {
        students.push(user);
      }
    }
  });

  return students;
}

// Returns the list of questions from Quiz including answers
async function getQuestions(quizId) {
  let quiz = await Quiz.findById(quizId);

  const formattedQuestions = [];
  for (let i = 0; i < quiz.questions.length; i++) {
    let question;
    switch (quiz.questions[i].type) {
      case "MCQ":
        question = await MCQ.findById(quiz.questions[i].question);
        break;
      case "MSQ":
        question = await MSQ.findById(quiz.questions[i].question);
        break;
      case "CLO":
        question = await CLO.findById(quiz.questions[i].question);
        break;
      case "OEQ":
        question = await OEQ.findById(quiz.questions[i].question);
        break;
    }

    formattedQuestions.push({
      ...question.toObject(),
      type: quiz.questions[i].type,
    });
  }

  return formattedQuestions;
}

export {
  createQuiz,
  getQuiz,
  getQuizObject,
  getMyQuizzes,
  getQuizzesForInstructedCourse,
  getQuizzesForEnrolledCourse,
  basicUpdateQuiz,
  updateQuiz,
  addQuizQuestions,
  generateQuizPDF,
  updateQuizQuestion,
  releaseQuiz,
  deleteDraftQuiz,
  releaseQuizGrades,
  getQuestions,
  getQuizStats,
};
