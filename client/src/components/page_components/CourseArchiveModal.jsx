import React, { useRef } from "react";
import Modal from "components/elements/Modal";
import AlertBanner from "components/elements/AlertBanner";
import { archiveCourse } from "api/CourseApi";
import Badge from "components/elements/Badge";

export default function CourseArchiveModal({
  modalShow,
  modalShowSet,
  courseObject,
  onSuccess,
}) {
  const alertRef = useRef();

  if (!courseObject.archived) {
    return (
      <Modal
        modalShow={modalShow}
        modalShowSet={modalShowSet}
        content={
          <div className="flex flex-col sm:w-96 gap-6">
            <h1 className="text-2xl font-bold inline-flex flex-wrap">
              <span className="mr-2">Archiving</span>
              <div className="flex items-center gap-2">
                {courseObject.courseCode}
                <Badge
                  label={courseObject.courseSemester}
                  accentColor={courseObject.accentColor}
                />
              </div>
            </h1>
            <AlertBanner ref={alertRef} />
            <div className="flex flex-col gap-4 text-gray-600">
              <span>
                Are you sure you want to archive{" "}
                <b>
                  {courseObject.courseCode} {courseObject.courseSemester}
                </b>
                ?{" "}
              </span>
              <span>
                The course will be moved into the folded{" "}
                <b>Archived Courses</b> section. You may unarchive it at any
                time.
              </span>
            </div>
            <div className="flex gap-4 mt-2">
              <button
                className="btn-primary"
                onClick={() => {
                  archiveCourse(courseObject.courseId).then((result) => {
                    if (result.success) {
                      modalShowSet(false);
                      onSuccess();
                    } else {
                      alertRef.current.setMessage(result.message);
                      alertRef.current.show();
                    }
                  });
                }}
              >
                Confirm
              </button>
              <button
                className="btn-secondary"
                onClick={() => modalShowSet(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        }
      />
    );
  } else {
    return (
      <Modal
        modalShow={modalShow}
        modalShowSet={modalShowSet}
        content={
          <div className="flex flex-col sm:w-96 gap-6">
            <h1 className="text-2xl font-bold inline-flex flex-wrap">
              <span className="mr-2">Unarchiving</span>
              <div className="flex items-center gap-2">
                {courseObject.courseCode}
                <Badge
                  label={courseObject.courseSemester}
                  accentColor={courseObject.accentColor}
                />
              </div>
            </h1>
            <AlertBanner ref={alertRef} />
            <div className="flex flex-col gap-4 text-gray-600">
              <span>
                Are you sure you want to unarchive{" "}
                <b>
                  {courseObject.courseCode} {courseObject.courseSemester}
                </b>
                ?{" "}
              </span>
            </div>
            <div className="flex gap-4 mt-2">
              <button
                className="btn-primary"
                onClick={() => {
                  archiveCourse(courseObject.courseId).then((result) => {
                    if (result.success) {
                      modalShowSet(false);
                      onSuccess();
                    } else {
                      alertRef.current.setMessage(result.message);
                      alertRef.current.show();
                    }
                  });
                }}
              >
                Confirm
              </button>
              <button
                className="btn-secondary"
                onClick={() => modalShowSet(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        }
      />
    );
  }
}
