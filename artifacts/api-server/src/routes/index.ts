import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import playersRouter from "./players";
import avatarRouter from "./avatar";
import chatRouter from "./chat";
import plazaRouter from "./plaza";
import roomsRouter from "./rooms";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(playersRouter);
router.use(avatarRouter);
router.use(chatRouter);
router.use(plazaRouter);
router.use(roomsRouter);

export default router;
