import { Button, Modal } from "react-bootstrap";

// Modal for saving the current live chat
export default function SaveChatModal({ recording, show, onClose, saveChat }: { recording: boolean, show: boolean; onClose: () => void; saveChat: () => void; }) {
    if (recording) {
        return (
            <Modal show={show} onHide={onClose} backdrop="static" keyboard={false}centered>
                <Modal.Header closeButton><Modal.Title>Please stop recording before you end this chat.</Modal.Title></Modal.Header>
            </Modal>
        )
    }
    return (
        <Modal show={show} onHide={onClose} backdrop="static" keyboard={false} centered >

            <Modal.Header closeButton><Modal.Title> Save & End Chat </Modal.Title> </Modal.Header>
            <Modal.Body> Are you sure you want to finish chatting? You will not be able to continue this chat. </Modal.Body>
            <Modal.Footer>
                <Button onClick={onClose } variant="outline-primary"> No  </Button>
                <Button onClick={saveChat} variant="danger"         > Yes </Button>
            </Modal.Footer>

        </Modal>
    );
}
