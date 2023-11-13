import React, { useRef, useState } from "react";
import Modal from "components/elements/Modal";
import AlertBanner from "components/elements/AlertBanner";
import SingleLineInput from "components/elements/SingleLineInput";
import FreeFormInput from "components/elements/FreeFormInput";
import { DateTimeField } from '@mui/x-date-pickers';
import { createQuiz } from "api/QuizApi";

export default function QuizCreateModal({
  modalShow,
  modalShowSet,
  courseId,
  onSuccess,
}) {
  const alertRef = useRef();
  const quizNameInputRef = useRef();
  const quizStartTimeInputRef = useRef();
  const quizEndTimeInputRef = useRef();
  const questionsArrRef = useRef();

  const [step, stepSet] = useState(0);
  const [quizCreationData, quizCreationDataSet] = useState({});
  const [questionsArrField, setQuestionsArrField] = useState(null);

  const addQuizCreationData = (key, value) => {
    let newData = quizCreationData;
    newData[key] = value;
    quizCreationDataSet(newData);
  };

  const resetAllStates = () => {
    stepSet(0);
    quizCreationDataSet({});
  };

  const submitCreateQuizForm = async (e) => {
    e.preventDefault();
    let inputsValidated = quizNameInputRef.current.validate("required");

    if (!inputsValidated) {
      alertRef.current.setMessage("Please fill out all required fields");
      alertRef.current.show();
      return;
    }

    let startTime = Date.parse(quizStartTimeInputRef.current.value);
    let endTime = Date.parse(quizEndTimeInputRef.current.value);
    if (startTime < Date.now() || endTime < startTime) {
      alertRef.current.setMessage("Need a future start time and a later end time");
      alertRef.current.show();
      return;
    }

    alertRef.current.hide();

    const formData = new FormData(e.target);
    formData.forEach((value, key) => addQuizCreationData(key, value));
    if (quizCreationData["quizStartTime"]) {
      addQuizCreationData("startTime", new Date(quizCreationData["quizStartTime"]));
    }
    if (quizCreationData["quizEndTime"]) {
      addQuizCreationData("endTime", new Date(quizCreationData["quizEndTime"]));
    }

    stepSet(step + 1);
  };

  return(
    modalShow && (
      <div
        className="fixed z-50 h-screen w-screen"
      >
        <Modal
          modalShow={modalShow}
          modalShowSet={modalShowSet}
          onClose={() => {
            resetAllStates();
          }}
          content={
            <div className="sm:w-96">
              {/* --- Step 1 --- */}
              {step === 0 && (
                <div className="flex flex-col gap-6">
                  <h1 className="text-2xl font-bold">Create a new quiz</h1>
                  <span className="text-gray-600">
                    Please complete the quiz information
                  </span>
                  <form
                    autoComplete="off"
                    className="gap-6 flex flex-col"
                    onSubmit={submitCreateQuizForm}
                  >
                    <AlertBanner ref={alertRef} />
                    <div className="relative flex flex-col gap-4">
                      <SingleLineInput
                        ref={quizNameInputRef}
                        name="quizName"
                        label="Quiz name"
                        acceptSpace
                      />
                      <div className="flex gap-2">
                        <DateTimeField
                          label="Start time"
                          name="quizStartTime"
                          inputRef={quizStartTimeInputRef}
                          format="L HH:mm"
                          clearable={true}
                          required={true}
                        />
                        <DateTimeField
                          label="End time"
                          name="quizEndTime"
                          inputRef={quizEndTimeInputRef}
                          format="L HH:mm"
                          clearable={true}
                          required={true}
                        />
                      </div>
                    </div>
                    <button type="submit" className="btn-primary">Next</button>
                  </form>
                </div>
              )}
              {/* --- Step 2 --- */}
              {step === 1 && (
                <div className="flex flex-col gap-6">
                  <h1 className="text-2xl font-bold">Add Questions</h1>
                  <AlertBanner ref={alertRef} />
                  <FreeFormInput
                    ref={questionsArrRef}
                    name="questionsArr"
                    label="Questions array (JSON)"
                    onChange={(e) => setQuestionsArrField(JSON.parse(e.target.value))}
                  />
                  <button
                    className="btn-primary"
                    style={{
                      opacity: questionsArrField ? 1 : 0.4,
                      pointerEvents: questionsArrField ? "auto" : "none",
                    }}
                    onClick={() => {
                      addQuizCreationData("questions", questionsArrRef.current.getValue());
                      addQuizCreationData("course", courseId);
                      console.log(quizCreationData);
                      createQuiz(quizCreationData).then((result) => {
                        if (result.success) {
                          onSuccess(
                            result.payload.quizName
                          );
                          resetAllStates();
                          modalShowSet(false);
                        } else {
                          alertRef.current.setMessage(
                            result.message || "Something went wrong"
                          );
                          alertRef.current.show();
                        }
                      });
                    }}
                  >
                    Finish
                  </button>
                </div>
              )}
            </div>
          }
        />
      </div>
    )
  );
}